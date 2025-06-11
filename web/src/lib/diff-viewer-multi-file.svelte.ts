import {
    fetchGithubCommitDiff,
    fetchGithubComparison,
    fetchGithubFile,
    fetchGithubPRComparison,
    type FileStatus,
    getGithubToken,
    type GithubDiff,
} from "./github.svelte";
import { type StructuredPatch, parsePatch } from "diff";
import {
    ConciseDiffViewCachedState,
    DEFAULT_THEME_DARK,
    DEFAULT_THEME_LIGHT,
    hasNonHeaderChanges,
    isNoNewlineAtEofLine,
    parseSinglePatch,
} from "$lib/components/diff/concise-diff-view.svelte";
import type { BundledTheme } from "shiki";
import { browser } from "$app/environment";
import { getEffectiveGlobalTheme } from "$lib/theme.svelte";
import { countOccurrences, type FileTreeNodeData, isImageFile, makeFileTree, type LazyPromise, lazyPromise, watchLocalStorage } from "$lib/util";
import { onDestroy } from "svelte";
import { type TreeNode, TreeState } from "$lib/components/tree/index.svelte";
import { VList } from "virtua/svelte";
import { Context, Debounced } from "runed";
import { MediaQuery } from "svelte/reactivity";

export type SidebarLocation = "left" | "right";

export class GlobalOptions {
    private static readonly localStorageKey = "diff-viewer-global-options";
    private static readonly context = new Context<GlobalOptions>(GlobalOptions.localStorageKey);

    static init() {
        const opts = new GlobalOptions();
        if (!browser) {
            GlobalOptions.context.set(opts);
            return opts;
        }
        const serialized = localStorage.getItem(GlobalOptions.localStorageKey);
        if (serialized !== null) {
            opts.deserialize(serialized);
        }
        GlobalOptions.context.set(opts);
        return opts;
    }

    static get() {
        return GlobalOptions.context.get();
    }

    syntaxHighlighting = $state(true);
    syntaxHighlightingThemeLight: BundledTheme = $state(DEFAULT_THEME_LIGHT);
    syntaxHighlightingThemeDark: BundledTheme = $state(DEFAULT_THEME_DARK);
    wordDiffs = $state(true);
    lineWrap = $state(true);
    omitPatchHeaderOnlyHunks = $state(true);
    // TODO: send to server (use cookie?) to that the initial position is correct
    sidebarLocation: SidebarLocation = $state("left");

    private constructor() {
        $effect(() => {
            this.save();
        });

        watchLocalStorage(GlobalOptions.localStorageKey, (newValue) => {
            if (newValue) {
                this.deserialize(newValue);
            }
        });
    }

    get syntaxHighlightingTheme() {
        switch (getEffectiveGlobalTheme()) {
            case "dark":
                return this.syntaxHighlightingThemeDark;
            case "light":
                return this.syntaxHighlightingThemeLight;
        }
    }

    private save() {
        if (!browser) {
            return;
        }
        localStorage.setItem(GlobalOptions.localStorageKey, this.serialize());
    }

    private serialize() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cereal: any = {
            syntaxHighlighting: this.syntaxHighlighting,
            omitPatchHeaderOnlyHunks: this.omitPatchHeaderOnlyHunks,
            wordDiff: this.wordDiffs,
            lineWrap: this.lineWrap,
            sidebarLocation: this.sidebarLocation,
        };
        if (this.syntaxHighlightingThemeLight !== DEFAULT_THEME_LIGHT) {
            cereal.syntaxHighlightingThemeLight = this.syntaxHighlightingThemeLight;
        }
        if (this.syntaxHighlightingThemeDark !== DEFAULT_THEME_DARK) {
            cereal.syntaxHighlightingThemeDark = this.syntaxHighlightingThemeDark;
        }
        return JSON.stringify(cereal);
    }

    private deserialize(serialized: string) {
        const jsonObject = JSON.parse(serialized);
        if (jsonObject.syntaxHighlighting !== undefined) {
            this.syntaxHighlighting = jsonObject.syntaxHighlighting;
        }
        if (jsonObject.syntaxHighlightingThemeLight !== undefined) {
            this.syntaxHighlightingThemeLight = jsonObject.syntaxHighlightingThemeLight as BundledTheme;
        } else {
            this.syntaxHighlightingThemeLight = DEFAULT_THEME_LIGHT;
        }
        if (jsonObject.syntaxHighlightingThemeDark !== undefined) {
            this.syntaxHighlightingThemeDark = jsonObject.syntaxHighlightingThemeDark as BundledTheme;
        } else {
            this.syntaxHighlightingThemeDark = DEFAULT_THEME_DARK;
        }
        if (jsonObject.omitPatchHeaderOnlyHunks !== undefined) {
            this.omitPatchHeaderOnlyHunks = jsonObject.omitPatchHeaderOnlyHunks;
        }
        if (jsonObject.wordDiff !== undefined) {
            this.wordDiffs = jsonObject.wordDiff;
        }
        if (jsonObject.lineWrap !== undefined) {
            this.lineWrap = jsonObject.lineWrap;
        }
        if (jsonObject.sidebarLocation !== undefined) {
            this.sidebarLocation = jsonObject.sidebarLocation;
        }
    }
}

export const staticSidebar = new MediaQuery("(width >= 64rem)");

export type AddOrRemove = "add" | "remove";

export type FileDetails = {
    content: string;
    fromFile: string;
    toFile: string;
    fromBlob?: Blob;
    toBlob?: Blob;
    status: FileStatus;
};

// Sort such that when displayed as a file tree, directories come before files and each level is sorted by name
function compareFileDetails(a: FileDetails, b: FileDetails): number {
    const aName = a.toFile;
    const bName = b.toFile;

    // Split paths into components
    const aParts = aName.split("/");
    const bParts = bName.split("/");

    // Compare component by component
    const minLength = Math.min(aParts.length, bParts.length);

    for (let i = 0; i < minLength; i++) {
        // If we're not at the last component of both paths
        if (i < aParts.length - 1 && i < bParts.length - 1) {
            const comparison = aParts[i].localeCompare(bParts[i]);
            if (comparison !== 0) {
                return comparison;
            }
            continue;
        }

        // If one path is longer at this position (has subdirectories)
        if (i === bParts.length - 1 && i < aParts.length - 1) {
            // a has subdirectories, so it should come first
            return -1;
        }
        if (i === aParts.length - 1 && i < bParts.length - 1) {
            // b has subdirectories, so it should come first
            return 1;
        }

        // Both are at their final component, compare them
        return aParts[i].localeCompare(bParts[i]);
    }

    // If one path is a prefix of the other, shorter path comes first
    return aParts.length - bParts.length;
}

export type FileStatusProps = {
    iconClasses: string;
    title: string;
};

const addStatusProps: FileStatusProps = {
    iconClasses: "iconify octicon--file-added-16 text-green-600",
    title: "Added",
};
const removeStatusProps: FileStatusProps = {
    iconClasses: "iconify octicon--file-removed-16 text-red-600",
    title: "Removed",
};
const modifyStatusProps: FileStatusProps = {
    iconClasses: "iconify octicon--file-diff-16 text-yellow-600",
    title: "Modified",
};
const renamedStatusProps: FileStatusProps = {
    iconClasses: "iconify octicon--file-moved-16 text-gray-600",
    title: "Renamed",
};
const renamedModifiedStatusProps: FileStatusProps = {
    iconClasses: "iconify octicon--file-moved-16 text-yellow-600",
    title: "Renamed and Modified",
};

export function getFileStatusProps(status: FileStatus): FileStatusProps {
    switch (status) {
        case "added":
            return addStatusProps;
        case "removed":
            return removeStatusProps;
        case "renamed":
            return renamedStatusProps;
        case "renamed_modified":
            return renamedModifiedStatusProps;
        default:
            return modifyStatusProps;
    }
}

export function findHeaderChangeOnlyPatches(patchStrings: string[]) {
    const result: boolean[] = [];

    for (let i = 0; i < patchStrings.length; i++) {
        const patchString = patchStrings[i];
        if (patchString === undefined || patchString.length === 0) {
            result.push(false);
            continue;
        }
        // TODO: Parsing twice is wasteful
        const patches = parsePatch(patchString);
        if (patches.length !== 1) {
            result.push(false);
            continue;
        }
        const patch = patches[0];
        if (patch.hunks.length === 0) {
            result.push(false);
            continue;
        }
        let onlyHeaderChanges = true;
        for (let j = 0; j < patch.hunks.length; j++) {
            if (hasNonHeaderChanges(patch.hunks[j].lines)) {
                onlyHeaderChanges = false;
            }
        }
        result.push(onlyHeaderChanges);
    }

    return result;
}

export type ImageDiffDetails = {
    fileA: LazyPromise<string> | null;
    fileB: LazyPromise<string> | null;
    load: boolean;
};

export function requireEitherImage(details: ImageDiffDetails) {
    if (details.fileA) return details.fileA;
    if (details.fileB) return details.fileB;
    throw new Error("Neither image is available");
}

export type ViewerStatistics = {
    addedLines: number;
    removedLines: number;
    fileAddedLines: number[];
    fileRemovedLines: number[];
};

export type DiffMetadata = {
    type: "file" | "github";
    fileName?: string;
    githubDetails?: GithubDiff;
};

export class MultiFileDiffViewerState {
    private static readonly context = new Context<MultiFileDiffViewerState>("MultiFileDiffViewerState");

    static init() {
        return MultiFileDiffViewerState.context.set(new MultiFileDiffViewerState());
    }

    static get() {
        return MultiFileDiffViewerState.context.get();
    }

    fileTreeFilter: string = $state("");
    searchQuery: string = $state("");
    collapsed: boolean[] = $state([]);
    checked: boolean[] = $state([]);
    fileDetails: FileDetails[] = $state([]);
    diffText: string[] = $state([]);
    diffs: Promise<StructuredPatch>[] = $state([]);
    diffViewCache: Map<FileDetails, ConciseDiffViewCachedState> = new Map();
    images: ImageDiffDetails[] = $state([]);
    vlist: VList<FileDetails> | undefined = $state();
    tree: TreeState<FileTreeNodeData> | undefined = $state();
    activeSearchResult: ActiveSearchResult | null = $state(null);
    sidebarCollapsed = $state(false);
    diffMetadata: DiffMetadata | null = $state(null);

    readonly fileTreeFilterDebounced = new Debounced(() => this.fileTreeFilter, 500);
    readonly searchQueryDebounced = new Debounced(() => this.searchQuery, 500);
    readonly stats: Promise<ViewerStatistics> = $derived(this.countStats());
    readonly fileTreeRoots: TreeNode<FileTreeNodeData>[] = $derived(makeFileTree(this.fileDetails));
    readonly filteredFileDetails: FileDetails[] = $derived(
        this.fileTreeFilterDebounced.current ? this.fileDetails.filter((f) => this.filterFile(f)) : this.fileDetails,
    );
    readonly patchHeaderDiffOnly: boolean[] = $derived(findHeaderChangeOnlyPatches(this.diffText));
    readonly searchResults: Promise<SearchResults> = $derived(this.findSearchResults());

    private constructor() {
        // Auto-check all patch header diff only diffs
        $effect(() => {
            for (let i = 0; i < this.patchHeaderDiffOnly.length; i++) {
                if (this.patchHeaderDiffOnly[i] && this.checked[i] === undefined) {
                    this.checked[i] = true;
                }
            }
        });

        // Make sure to revoke object URLs when the component is destroyed
        onDestroy(() => this.clearImages());
    }

    getIndex(details: FileDetails): number {
        return this.fileDetails.findIndex((f) => f.fromFile === details.fromFile && f.toFile === details.toFile);
    }

    filterFile(file: FileDetails): boolean {
        const queryLower = this.fileTreeFilterDebounced.current.toLowerCase();
        return file.toFile.toLowerCase().includes(queryLower) || file.fromFile.toLowerCase().includes(queryLower);
    }

    clearSearch() {
        this.fileTreeFilter = "";
    }

    toggleCollapse(index: number) {
        this.collapsed[index] = !(this.collapsed[index] || false);
    }

    expandAll() {
        this.collapsed = [];
    }

    collapseAll() {
        this.collapsed = this.fileDetails.map(() => true);
    }

    toggleChecked(index: number) {
        this.checked[index] = !this.checked[index];
        if (this.checked[index]) {
            // Auto-collapse on check
            this.collapsed[index] = true;
        }
    }

    scrollToFile(index: number, options: { autoExpand?: boolean; smooth?: boolean; focus?: boolean } = {}) {
        if (!this.vlist) return;

        const autoExpand = options.autoExpand ?? true;
        const smooth = options.smooth ?? false;
        const focus = options.focus ?? false;

        if (autoExpand && !this.checked[index]) {
            // Auto-expand on jump when not checked
            this.collapsed[index] = false;
        }
        this.vlist.scrollToIndex(index, { align: "start", smooth });
        if (focus) {
            requestAnimationFrame(() => {
                const headerElement = document.getElementById(`file-header-${index}`);
                headerElement?.focus();
            });
        }
    }

    // https://github.com/inokawa/virtua/issues/621
    // https://github.com/inokawa/virtua/discussions/542#discussioncomment-11214618
    async scrollToMatch(file: FileDetails, idx: number) {
        if (!this.vlist) return;
        const fileIdx = this.getIndex(file);
        this.collapsed[fileIdx] = false;
        const startIdx = this.vlist.findStartIndex();
        const endIdx = this.vlist.findEndIndex();
        if (fileIdx < startIdx || fileIdx > endIdx) {
            this.vlist.scrollToIndex(fileIdx, { align: "start" });
        }

        requestAnimationFrame(() => {
            const fileElement = document.getElementById(`file-${fileIdx}`);
            const resultElement = fileElement?.querySelector(`[data-match-id='${idx}']`) as HTMLElement | null | undefined;
            if (!resultElement) return;
            resultElement.scrollIntoView({ block: "center", inline: "center" });
        });
    }

    clearImages() {
        for (let i = 0; i < this.images.length; i++) {
            const image = this.images[i];
            if (image !== null && image !== undefined) {
                image.load = false;
                const fileA = image.fileA;
                if (fileA?.hasValue()) {
                    (async () => {
                        const a = await fileA.getValue();
                        URL.revokeObjectURL(a);
                    })();
                }
                const fileB = image.fileB;
                if (fileB?.hasValue()) {
                    (async () => {
                        const b = await fileB.getValue();
                        URL.revokeObjectURL(b);
                    })();
                }
            }
        }
        this.images = [];
    }

    loadPatches(patches: FileDetails[], meta: { githubDetails?: GithubDiff; fileName?: string }) {
        // Reset state
        this.collapsed = [];
        this.checked = [];
        this.fileDetails = [];
        this.diffText = [];
        this.diffs = [];
        this.clearImages();
        this.vlist?.scrollToIndex(0, { align: "start" });

        if (meta.fileName) {
            this.diffMetadata = { type: "file", fileName: meta.fileName };
        } else if (meta.githubDetails) {
            this.diffMetadata = {
                type: "github",
                githubDetails: meta.githubDetails,
            };
        } else {
            this.diffMetadata = null;
        }

        patches.sort(compareFileDetails);

        // Load new state
        for (let i = 0; i < patches.length; i++) {
            const patch = patches[i];

            const isImageDiff = isImageFile(patch.fromFile) && isImageFile(patch.toFile);
            if (isImageDiff && meta.githubDetails) {
                const githubDetailsCopy = meta.githubDetails;

                let fileA: LazyPromise<string> | null = null;
                if (patch.status !== "added") {
                    fileA = lazyPromise(async () =>
                        URL.createObjectURL(
                            await fetchGithubFile(getGithubToken(), githubDetailsCopy.owner, githubDetailsCopy.repo, patch.fromFile, githubDetailsCopy.base),
                        ),
                    );
                }

                let fileB: LazyPromise<string> | null = null;
                if (patch.status !== "removed") {
                    fileB = lazyPromise(async () =>
                        URL.createObjectURL(
                            await fetchGithubFile(getGithubToken(), githubDetailsCopy.owner, githubDetailsCopy.repo, patch.toFile, githubDetailsCopy.head),
                        ),
                    );
                }

                this.images[i] = { fileA, fileB, load: false };
                continue;
            }
            const fromBlob = patch.fromBlob;
            const toBlob = patch.toBlob;
            if (isImageDiff && fromBlob && toBlob) {
                let fileA: LazyPromise<string> | null = null;
                if (patch.status !== "added") {
                    fileA = lazyPromise(async () => URL.createObjectURL(fromBlob));
                }

                let fileB: LazyPromise<string> | null = null;
                if (patch.status !== "removed") {
                    fileB = lazyPromise(async () => URL.createObjectURL(toBlob));
                }

                this.images[i] = { fileA, fileB, load: false };
                continue;
            }

            this.diffText[i] = patch.content;
            this.diffs[i] = (async () => {
                return parseSinglePatch(patch.content);
            })();
        }

        // Set this last since it's what the VList loads
        this.fileDetails.push(...patches);
    }

    // TODO fails for initial commit?
    // handle matched github url
    async loadFromGithubApi(match: Array<string>): Promise<boolean> {
        const [url, owner, repo, type, id] = match;
        const token = getGithubToken();

        try {
            if (type === "commit") {
                const { info, files } = await fetchGithubCommitDiff(token, owner, repo, id.split("/")[0]);
                this.loadPatches(files, { githubDetails: info });
                return true;
            } else if (type === "pull") {
                const { info, files } = await fetchGithubPRComparison(token, owner, repo, id.split("/")[0]);
                this.loadPatches(files, { githubDetails: info });
                return true;
            } else if (type === "compare") {
                let refs = id.split("...");
                if (refs.length !== 2) {
                    refs = id.split("..");
                    if (refs.length !== 2) {
                        alert(`Invalid comparison URL. '${id}' does not match format 'ref_a...ref_b' or 'ref_a..ref_b'`);
                        return false;
                    }
                }
                const base = refs[0];
                const head = refs[1];
                const { info, files } = await fetchGithubComparison(token, owner, repo, base, head);
                this.loadPatches(files, { githubDetails: info });
                return true;
            }
        } catch (error) {
            console.error(error);
            alert(`Failed to load diff from GitHub: ${error}`);
            return false;
        }

        alert("Unsupported URL type " + url);
        return false;
    }

    private async countStats(): Promise<ViewerStatistics> {
        let addedLines = 0;
        let removedLines = 0;
        const fileAddedLines: number[] = [];
        const fileRemovedLines: number[] = [];

        for (let i = 0; i < this.fileDetails.length; i++) {
            const diff = await this.diffs[i];
            if (!diff) {
                continue;
            }

            for (let j = 0; j < diff.hunks.length; j++) {
                const hunk = diff.hunks[j];

                for (let k = 0; k < hunk.lines.length; k++) {
                    const line = hunk.lines[k];

                    if (line.startsWith("+")) {
                        addedLines++;
                        fileAddedLines[i] = (fileAddedLines[i] || 0) + 1;
                    } else if (line.startsWith("-")) {
                        removedLines++;
                        fileRemovedLines[i] = (fileRemovedLines[i] || 0) + 1;
                    }
                }
            }
        }

        return { addedLines, removedLines, fileAddedLines, fileRemovedLines };
    }

    private async findSearchResults(): Promise<SearchResults> {
        let query = this.searchQueryDebounced.current;
        if (!query) {
            return SearchResults.EMPTY;
        }
        query = query.toLowerCase();

        const diffs = await Promise.all(this.diffs);

        let total = 0;
        const lines: Map<FileDetails, number[][]> = new Map();
        const counts: Map<FileDetails, number> = new Map();
        const mappings: Map<number, FileDetails> = new Map();
        for (let i = 0; i < diffs.length; i++) {
            const diff = diffs[i];
            if (diff === undefined) {
                continue;
            }
            const details = this.fileDetails[i];
            const lineNumbers: number[][] = [];
            let found = false;

            for (let j = 0; j < diff.hunks.length; j++) {
                const hunk = diff.hunks[j];
                const hunkLineNumbers: number[] = [];
                lineNumbers[j] = hunkLineNumbers;

                let lineIdx = 0;
                for (let k = 0; k < hunk.lines.length; k++) {
                    if (isNoNewlineAtEofLine(hunk.lines[k])) {
                        // These lines are 'merged' into the previous line
                        continue;
                    }
                    const count = countOccurrences(hunk.lines[k].slice(1).toLowerCase(), query);
                    if (count !== 0) {
                        counts.set(details, (counts.get(details) ?? 0) + count);
                        total += count;
                        if (!hunkLineNumbers.includes(lineIdx)) {
                            hunkLineNumbers.push(lineIdx);
                        }
                        found = true;
                    }
                    lineIdx++;
                }
            }

            if (found) {
                mappings.set(total, details);
                lines.set(details, lineNumbers);
            }
        }

        return new SearchResults(counts, total, mappings, lines);
    }
}

export type ActiveSearchResult = {
    file: FileDetails;
    idx: number;
};

export class SearchResults {
    static EMPTY = new SearchResults(new Map(), 0, new Map(), new Map());

    counts: Map<FileDetails, number>;
    mappings: Map<number, FileDetails> = new Map();
    // FileDetails -> Hunk -> Line
    lines: Map<FileDetails, number[][]> = new Map();
    totalMatches: number;

    constructor(counts: Map<FileDetails, number>, total: number, mappings: Map<number, FileDetails>, lines: Map<FileDetails, number[][]>) {
        this.counts = counts;
        this.totalMatches = total;
        this.mappings = mappings;
        this.lines = lines;
    }

    getLocation(index: number): ActiveSearchResult {
        index++; // Mappings are 1-based
        const originalIndex = index;

        let file = this.mappings.get(index);
        while (file === undefined && index < this.totalMatches) {
            index++;
            file = this.mappings.get(index);
        }
        if (file === undefined) {
            throw new Error("No file found");
        }

        const matchCount = this.counts.get(file) || 0;
        return { file, idx: matchCount - 1 - (index - originalIndex) };
    }
}

import { fetchGithubCommitDiff, fetchGithubComparison, fetchGithubPRComparison, type FileStatus, getGithubToken, type GithubDiff } from "./github.svelte";
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
import { countOccurrences, type FileTreeNodeData, makeFileTree, type LazyPromise, lazyPromise, watchLocalStorage } from "$lib/util";
import { onDestroy } from "svelte";
import { type TreeNode, TreeState } from "$lib/components/tree/index.svelte";
import { VList } from "virtua/svelte";
import { Context, Debounced } from "runed";
import { MediaQuery } from "svelte/reactivity";

export type SidebarLocation = "left" | "right";

export class GlobalOptions {
    static readonly key = "diff-viewer-global-options";
    private static readonly context = new Context<GlobalOptions>(GlobalOptions.key);

    static init(cookie?: string) {
        const opts = new GlobalOptions();
        if (!browser) {
            GlobalOptions.context.set(opts);
            if (cookie) {
                opts.deserialize(cookie);
            }
            return opts;
        }
        const serialized = localStorage.getItem(GlobalOptions.key);
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
    sidebarLocation: SidebarLocation = $state("left");

    private constructor() {
        $effect(() => {
            this.save();
        });

        watchLocalStorage(GlobalOptions.key, (newValue) => {
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
        localStorage.setItem(GlobalOptions.key, this.serialize());
        document.cookie = `${GlobalOptions.key}=${encodeURIComponent(this.serializeCookie())}; path=/; max-age=31536000; SameSite=Lax`;
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

    private serializeCookie() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cereal: any = {
            sidebarLocation: this.sidebarLocation,
        };
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

export type CommonFileDetails = {
    fromFile: string;
    toFile: string;
    status: FileStatus;
};

export type TextFileDetails = CommonFileDetails & {
    type: "text";
    patchText: string;
    structuredPatch: Promise<StructuredPatch>;
};

export type ImageFileDetails = CommonFileDetails & {
    type: "image";
    image: ImageDiffDetails;
};

export function makeTextDetails(fromFile: string, toFile: string, status: FileStatus, patchText: string): TextFileDetails {
    return {
        type: "text",
        fromFile,
        toFile,
        status,
        patchText,
        structuredPatch: (async () => parseSinglePatch(patchText))(),
    };
}

export function makeImageDetails(
    fromFile: string,
    toFile: string,
    status: FileStatus,
    fromBlob?: Promise<Blob> | Blob,
    toBlob?: Promise<Blob> | Blob,
): ImageFileDetails {
    return {
        type: "image",
        fromFile,
        toFile,
        status,
        image: {
            fileA: fromBlob !== undefined ? lazyPromise(async () => URL.createObjectURL(await fromBlob)) : null,
            fileB: toBlob !== undefined ? lazyPromise(async () => URL.createObjectURL(await toBlob)) : null,
            load: false,
        },
    };
}

export type FileDetails = TextFileDetails | ImageFileDetails;

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

export function findHeaderChangeOnlyPatches(fileDetails: FileDetails[]) {
    const patchStrings = fileDetails.map((details) => {
        if (details.type === "text") {
            return details.patchText;
        }
        return undefined;
    });

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

export type ViewerStatistics = {
    addedLines: number;
    removedLines: number;
    fileAddedLines: number[];
    fileRemovedLines: number[];
};

export type GithubDiffMetadata = {
    type: "github";
    details: GithubDiff;
};

export type FileDiffMetadata = {
    type: "file";
    fileName: string;
};

export type DiffMetadata = GithubDiffMetadata | FileDiffMetadata;

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
    diffViewCache: Map<FileDetails, ConciseDiffViewCachedState> = new Map();
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
    readonly patchHeaderDiffOnly: boolean[] = $derived(findHeaderChangeOnlyPatches(this.fileDetails));
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
        for (let i = 0; i < this.fileDetails.length; i++) {
            const details = this.fileDetails[i];
            if (details.type !== "image") {
                continue;
            }
            const image = details.image;
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

    loadPatches(patches: FileDetails[], meta: DiffMetadata | null) {
        // Reset state
        this.collapsed = [];
        this.checked = [];
        this.fileDetails = [];
        this.clearImages();
        this.vlist?.scrollToIndex(0, { align: "start" });
        this.diffMetadata = meta;

        patches.sort(compareFileDetails);

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
                this.loadPatches(files, { type: "github", details: info });
                return true;
            } else if (type === "pull") {
                const { info, files } = await fetchGithubPRComparison(token, owner, repo, id.split("/")[0]);
                this.loadPatches(files, { type: "github", details: info });
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
                this.loadPatches(files, { type: "github", details: info });
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
            const details = this.fileDetails[i];
            if (details.type !== "text") {
                continue;
            }
            const diff = await details.structuredPatch;

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

        const diffPromises = this.fileDetails.map((details) => {
            if (details.type !== "text") {
                return undefined;
            }
            return details.structuredPatch;
        });
        const diffs = await Promise.all(diffPromises);

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

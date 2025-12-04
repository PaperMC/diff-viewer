import {
    fetchGithubCommitDiff,
    fetchGithubComparison,
    fetchGithubPRComparison,
    type FileStatus,
    getGithubToken,
    type GithubDiff,
    type GithubDiffResult,
    parseMultiFilePatchGithub,
} from "./github.svelte";
import { type StructuredPatch } from "diff";
import {
    ConciseDiffViewCachedState,
    isNoNewlineAtEofLine,
    parseSinglePatch,
    patchHeaderDiffOnly,
    type LineSelection,
    writeLineRef,
    parseLineRef,
    type UnresolvedLineSelection,
} from "$lib/components/diff/concise-diff-view.svelte";
import { countOccurrences, type FileTreeNodeData, makeFileTree, type LazyPromise, lazyPromise, animationFramePromise, yieldToBrowser } from "$lib/util";
import { onDestroy, onMount, tick } from "svelte";
import { type TreeNode, TreeState } from "$lib/components/tree/index.svelte";
import { VList } from "virtua/svelte";
import { Context, Debounced, watch } from "runed";
import { MediaQuery } from "svelte/reactivity";
import { ProgressBarState } from "$lib/components/progress-bar/index.svelte";
import { Keybinds } from "./keybinds.svelte";
import { LayoutState, type PersistentLayoutState } from "./layout.svelte";
import { page } from "$app/state";
import { afterNavigate, goto, replaceState } from "$app/navigation";
import { type AfterNavigate } from "@sveltejs/kit";

export const GITHUB_URL_PARAM = "github_url";
export const PATCH_URL_PARAM = "patch_url";

export const staticSidebar = new MediaQuery("(width >= 64rem)");

export type AddOrRemove = "add" | "remove";

export interface CommonFileDetails {
    index: number;
    fromFile: string;
    toFile: string;
    status: FileStatus;
}

export interface TextFileDetails extends CommonFileDetails {
    type: "text";
    structuredPatch: StructuredPatch;
    patchHeaderDiffOnly: boolean;
}

export interface ImageFileDetails extends CommonFileDetails {
    type: "image";
    image: ImageDiffDetails;
}

export function makeTextDetails(fromFile: string, toFile: string, status: FileStatus, patchText: string): TextFileDetails {
    const patch = parseSinglePatch(patchText);
    return {
        index: -1,
        type: "text",
        fromFile,
        toFile,
        status,
        structuredPatch: patch,
        patchHeaderDiffOnly: patchHeaderDiffOnly(patch),
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
        index: -1,
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

export interface FileState {
    checked: boolean;
    collapsed: boolean;
}

export interface Selection {
    file: FileDetails;
    lines?: LineSelection;
    unresolvedLines?: UnresolvedLineSelection;
}

/**
 * Checks whether two selections refer to the same unresolved lines
 * in the same file.
 *
 * @param a selection a
 * @param b selection b
 * @returns true if the selections are semantically equal
 */
export function selectionsSemanticallyEqual(a: Selection | undefined, b: Selection | undefined): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.file !== b.file) return false;
    const linesA = a.lines ?? a.unresolvedLines;
    const linesB = b.lines ?? b.unresolvedLines;
    if (!linesA && !linesB) return true;
    if (!linesA || !linesB) return false;
    const startEquals = linesA.start.no === linesB.start.no && linesA.start.new === linesB.start.new;
    if (!startEquals) return false;
    const endEquals = linesA.end.no === linesB.end.no && linesA.end.new === linesB.end.new;
    return endEquals;
}

function makeUrlHashValue(selection: Selection): string {
    let hash = encodeURIComponent(selection.file.toFile);
    const lines = selection.lines ?? selection.unresolvedLines;
    if (lines) {
        hash += ":";
        hash += writeLineRef(lines.start);
        hash += ":";
        hash += writeLineRef(lines.end);
    }
    return hash;
}

interface UnresolvedSelection {
    file: string;
    lines?: UnresolvedLineSelection;
}

function parseUrlHashValue(hash: string): UnresolvedSelection | null {
    const parts = hash.split(":");
    if (parts.length === 1) {
        return {
            file: decodeURIComponent(parts[0]),
        };
    }
    if (parts.length !== 3) return null;
    const file = decodeURIComponent(parts[0]);
    const start = parseLineRef(parts[1]);
    const end = parseLineRef(parts[2]);
    if (!start || !end) return null;
    return {
        file,
        lines: { start, end },
    };
}

export interface ImageDiffDetails {
    fileA: LazyPromise<string> | null;
    fileB: LazyPromise<string> | null;
    load: boolean;
}

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

export interface FileStatusProps {
    iconClasses: string;
    title: string;
}

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

export interface ViewerStatistics {
    addedLines: number;
    removedLines: number;
    fileAddedLines: number[];
    fileRemovedLines: number[];
}

export interface BaseDiffMetadata {
    linkable: boolean;
}

export interface GithubDiffMetadata extends BaseDiffMetadata {
    type: "github";
    details: GithubDiff;
}

export interface FileDiffMetadata extends BaseDiffMetadata {
    type: "file";
    fileName: string;
    url?: string;
}

export type DiffMetadata = GithubDiffMetadata | FileDiffMetadata;

export function updateSearchParams(params: URLSearchParams, metadata: DiffMetadata) {
    if (metadata.type === "github") {
        params.set(GITHUB_URL_PARAM, metadata.details.backlink);
    } else {
        params.delete(GITHUB_URL_PARAM);
    }
    if (metadata.type === "file" && metadata.url) {
        params.set(PATCH_URL_PARAM, metadata.url);
    } else {
        params.delete(PATCH_URL_PARAM);
    }
}

export interface LoadPatchesOptions {
    /**
     * default: push
     */
    state?: "push" | "replace";
}

export class MultiFileDiffViewerState {
    private static readonly context = new Context<MultiFileDiffViewerState>("MultiFileDiffViewerState");

    static init(layoutState: PersistentLayoutState | null) {
        return MultiFileDiffViewerState.context.set(new MultiFileDiffViewerState(layoutState));
    }

    static get() {
        return MultiFileDiffViewerState.context.get();
    }

    // Main diff state
    diffMetadata: DiffMetadata | null = $state(null);
    fileDetails: FileDetails[] = $state([]); // Read-only state
    fileStates: FileState[] = $state([]); // Mutable state
    stats: ViewerStatistics = $state({
        addedLines: 0,
        removedLines: 0,
        fileAddedLines: [],
        fileRemovedLines: [],
    });

    // Content search state
    searchQuery: string = $state("");
    readonly searchQueryDebounced = new Debounced(() => this.searchQuery, 500);
    readonly searchResults: Promise<SearchResults> = $derived(this.findSearchResults());
    jumpToSearchResult: boolean = $state(false);

    // File tree state
    tree: TreeState<FileTreeNodeData> | undefined = $state();
    fileTreeFilter: string = $state("");
    readonly fileTreeRoots: TreeNode<FileTreeNodeData>[] = $derived(makeFileTree(this.fileDetails));
    readonly fileTreeFilterDebounced = new Debounced(() => this.fileTreeFilter, 500);
    readonly filteredFileDetails: FileDetails[] = $derived(
        this.fileTreeFilterDebounced.current ? this.fileDetails.filter((f) => this.filterFile(f)) : this.fileDetails,
    );

    // Selection state
    urlSelection: UnresolvedSelection | undefined = $state();
    selection: Selection | undefined = $state();
    jumpToSelection: boolean = $state(false);

    // Misc. component state
    diffViewCache: Map<FileDetails, ConciseDiffViewCachedState> = new Map();
    vlist: VList<FileDetails> | undefined = $state();
    readonly loadingState = new LoadingState();
    readonly layoutState;

    // Transient state
    openDiffDialogOpen = $state(false);
    settingsDialogOpen = $state(false);
    activeSearchResult: ActiveSearchResult | null = $state(null);

    private constructor(layoutState: PersistentLayoutState | null) {
        this.layoutState = new LayoutState(layoutState);

        // Make sure to revoke object URLs when the component is destroyed
        onDestroy(() => this.clearImages());

        onMount(() => {
            let hash = page.url.hash;
            if (hash.startsWith("#")) hash = hash.substring(1);
            if (hash) {
                this.urlSelection = parseUrlHashValue(hash) ?? undefined;
            }
        });

        afterNavigate((nav) => this.afterNavigate(nav));

        this.registerKeybinds();
    }

    private registerKeybinds() {
        const keybinds = new Keybinds();
        keybinds.registerModifierBind("o", () => this.openOpenDiffDialog());
        keybinds.registerModifierBind(",", () => this.openSettingsDialog());
        keybinds.registerModifierBind("b", () => this.layoutState.toggleSidebar());
    }

    private afterNavigate(nav: AfterNavigate) {
        if (!this.vlist) return;

        if (nav.type === "popstate") {
            const selection = page.state.selection;
            const file = selection ? this.fileDetails[selection.fileIdx] : undefined;
            if (selection && file) {
                this.selection = {
                    file,
                    lines: selection.lines,
                    unresolvedLines: selection.unresolvedLines,
                };
            } else {
                this.selection = undefined;
            }

            if (page.state.initialLoad ?? false) {
                if (this.selection) {
                    const hasLines = this.selection.lines || this.selection.unresolvedLines;
                    this.scrollToFile(this.selection.file.index, {
                        focus: !hasLines,
                    });
                    if (hasLines) {
                        this.jumpToSelection = true;
                    }
                } else {
                    this.vlist.scrollTo(0);
                }
            } else {
                const scrollOffset = page.state.scrollOffset;
                if (scrollOffset !== undefined) {
                    this.vlist.scrollTo(scrollOffset);
                }
            }
        }
    }

    openOpenDiffDialog() {
        this.openDiffDialogOpen = true;
        this.settingsDialogOpen = false;
    }

    openSettingsDialog() {
        this.settingsDialogOpen = true;
        this.openDiffDialogOpen = false;
    }

    filterFile(file: FileDetails): boolean {
        const queryLower = this.fileTreeFilterDebounced.current.toLowerCase();
        return file.toFile.toLowerCase().includes(queryLower) || file.fromFile.toLowerCase().includes(queryLower);
    }

    clearSearch() {
        this.fileTreeFilter = "";
    }

    toggleCollapse(idx: number) {
        const fileState = this.fileStates[idx];
        fileState.collapsed = !fileState.collapsed;
    }

    expandAll() {
        for (let i = 0; i < this.fileStates.length; i++) {
            this.fileStates[i].collapsed = false;
        }
    }

    collapseAll() {
        for (let i = 0; i < this.fileStates.length; i++) {
            this.fileStates[i].collapsed = true;
        }
    }

    toggleChecked(idx: number) {
        const fileState = this.fileStates[idx];
        fileState.checked = !fileState.checked;
        if (fileState.checked) {
            // Auto-collapse on check
            fileState.collapsed = true;
        }
    }

    getSelection(file: FileDetails) {
        if (this.selection?.file.index === file.index) {
            return this.selection;
        }
        return null;
    }

    private createPageState(opts?: { initialLoad?: boolean }): App.PageState {
        return {
            initialLoad: opts?.initialLoad ?? false,
            scrollOffset: this.vlist?.getScrollOffset(),
            selection: this.selection
                ? {
                      fileIdx: this.selection.file.index,
                      lines: $state.snapshot(this.selection.lines),
                      unresolvedLines: $state.snapshot(this.selection.unresolvedLines),
                  }
                : undefined,
        };
    }

    setSelection(file: FileDetails, lines: LineSelection | undefined) {
        const oldSelection = this.selection;
        this.selection = { file, lines };

        if (!selectionsSemanticallyEqual(oldSelection, this.selection)) {
            goto(`?${page.url.searchParams}#${makeUrlHashValue(this.selection)}`, {
                keepFocus: true,
                state: this.createPageState(),
            });
        }
    }

    clearSelection() {
        const oldSelection = this.selection;
        this.selection = undefined;

        if (oldSelection !== undefined) {
            goto(`?${page.url.searchParams}`, {
                keepFocus: true,
                state: this.createPageState(),
            });
        }
    }

    scrollToFile(index: number, options: { autoExpand?: boolean; smooth?: boolean; focus?: boolean } = {}) {
        if (!this.vlist) return;

        const autoExpand = options.autoExpand ?? true;
        const smooth = options.smooth ?? false;
        const focus = options.focus ?? false;

        const fileState = this.fileStates[index];
        if (autoExpand && !fileState.checked) {
            // Auto-expand on jump when not checked
            fileState.collapsed = false;
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
        const fileIdx = file.index;
        this.fileStates[fileIdx].collapsed = false;
        const startIdx = this.vlist.findItemIndex(this.vlist.scrollOffset);
        const endIdx = this.vlist.findItemIndex(this.vlist.scrollOffset + this.vlist.viewportSize);
        if (fileIdx < startIdx || fileIdx > endIdx) {
            this.vlist.scrollToIndex(fileIdx, { align: "start" });
        }

        requestAnimationFrame(() => {
            const fileElement = document.getElementById(`file-${fileIdx}`);
            const resultElement = fileElement?.querySelector(`[data-match-id='${idx}']`) as HTMLElement | null | undefined;
            if (!resultElement) {
                this.jumpToSearchResult = true;
                return;
            }
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

    private clear(clearMeta: boolean = true) {
        // Reset state
        this.selection = undefined;
        this.jumpToSelection = false;
        this.fileStates = [];
        if (clearMeta) {
            this.diffMetadata = null;
        }
        this.fileDetails = [];
        this.clearImages();
        this.vlist?.scrollToIndex(0, { align: "start" });
    }

    async loadPatches(meta: () => Promise<DiffMetadata>, patches: () => Promise<AsyncGenerator<FileDetails, void>>, opts?: LoadPatchesOptions) {
        if (this.loadingState.loading) {
            alert("Already loading patches, please wait.");
            return false;
        }
        try {
            // Show progress bar
            this.loadingState.start();
            await tick();
            await animationFramePromise();

            // Start potential multiple web requests in parallel
            const metaPromise = meta();
            const generatorPromise = patches();

            // Update metadata
            this.diffMetadata = await metaPromise;
            await tick();
            await animationFramePromise();

            // Clear previous state
            this.clear(false);
            await tick();
            await animationFramePromise();

            // Setup generator
            const generator = await generatorPromise;
            await tick();
            await animationFramePromise();

            // Load patches
            const tempDetails: FileDetails[] = [];
            const tempStates = new Map<string, FileState>();
            let lastYield = performance.now();
            let i = 0;
            for await (const details of generator) {
                i++;
                this.loadingState.loadedCount++;

                // Pushing directly to the main array causes too many signals to update (lag)
                tempDetails.push(details);

                let preChecked = false;
                if (details.type === "text") {
                    // Pre-check files with only header diff
                    preChecked = details.patchHeaderDiffOnly;
                }
                tempStates.set(details.fromFile, {
                    collapsed: false,
                    checked: preChecked,
                });

                if (performance.now() - lastYield > 50 || i % 100 === 0) {
                    await tick();
                    await yieldToBrowser();
                    lastYield = performance.now();
                }
            }
            if (tempDetails.length === 0) {
                throw new Error("No valid patches found in the provided data.");
            }

            tempDetails.sort(compareFileDetails);

            const statesArray: FileState[] = [];
            for (let i = 0; i < tempDetails.length; i++) {
                const details = tempDetails[i];
                details.index = i;
                const state = tempStates.get(details.fromFile);
                if (state) {
                    statesArray.push(state);
                }
            }

            this.fileDetails = tempDetails;
            this.fileStates = statesArray;
            this.stats = this.countStats();

            await tick();
            await animationFramePromise();

            const urlSelection = this.urlSelection;
            this.urlSelection = undefined;
            const selectedFile = urlSelection !== undefined ? this.fileDetails.find((f) => f.toFile === urlSelection.file) : undefined;

            // for a variety of reasons jumping to files/lines doesn't work as consistently as I'd like,
            // at best it doesn't matter, but it can lead to inconsistency between navigation and initial load, and sometimes not work at all
            if (urlSelection && selectedFile && this.diffMetadata.linkable) {
                this.jumpToSelection = urlSelection.lines !== undefined;
                this.selection = {
                    file: selectedFile,
                    unresolvedLines: urlSelection.lines,
                };
                this.scrollToFile(selectedFile.index, {
                    focus: !urlSelection.lines,
                });
                await animationFramePromise();
            }

            const newUrl = new URL(page.url);
            updateSearchParams(newUrl.searchParams, this.diffMetadata);
            if (this.selection) {
                newUrl.hash = makeUrlHashValue(this.selection);
            }
            const link = `${newUrl.search}${newUrl.hash}`;
            if (opts?.state === "replace") {
                replaceState(link, this.createPageState({ initialLoad: true }));
            } else {
                // We must use goto instead of replaceState, otherwise page.url will not be updated.
                // This is fine for loadPatches, but may be heavy handed in other cases. Do not blindly copy this strategy.
                // https://github.com/sveltejs/kit/issues/13569
                await goto(link, {
                    state: this.createPageState({ initialLoad: true }),
                });
            }

            return true;
        } catch (e) {
            this.clear(); // Clear any partially loaded state
            console.error("Failed to load patches:", e);
            alert("Failed to load patches: " + e);
            return false;
        } finally {
            // Let the last progress update render before closing the loading state
            await tick();
            await animationFramePromise();

            this.loadingState.done();
        }
    }

    private async loadPatchesGithub(resultOrPromise: Promise<GithubDiffResult> | GithubDiffResult, opts?: LoadPatchesOptions) {
        return await this.loadPatches(
            async () => {
                const result = resultOrPromise instanceof Promise ? await resultOrPromise : resultOrPromise;
                return { linkable: true, type: "github", details: await result.info };
            },
            async () => {
                const result = resultOrPromise instanceof Promise ? await resultOrPromise : resultOrPromise;
                return parseMultiFilePatchGithub(await result.info, await result.response, this.loadingState);
            },
            opts,
        );
    }

    // TODO fails for initial commit?
    // handle matched github url
    async loadFromGithubApi(match: Array<string>, opts?: LoadPatchesOptions): Promise<boolean> {
        const [url, owner, repo, type, id] = match;
        const token = getGithubToken();

        try {
            if (type === "commit") {
                return await this.loadPatchesGithub(fetchGithubCommitDiff(token, owner, repo, id.split("/")[0]), opts);
            } else if (type === "pull") {
                return await this.loadPatchesGithub(fetchGithubPRComparison(token, owner, repo, id.split("/")[0]), opts);
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
                return await this.loadPatchesGithub(fetchGithubComparison(token, owner, repo, base, head), opts);
            }
        } catch (error) {
            console.error(error);
            alert(`Failed to load diff from GitHub: ${error}`);
            return false;
        }

        alert("Unsupported URL type " + url);
        return false;
    }

    private countStats(): ViewerStatistics {
        let addedLines = 0;
        let removedLines = 0;
        const fileAddedLines: number[] = [];
        const fileRemovedLines: number[] = [];

        for (let i = 0; i < this.fileDetails.length; i++) {
            const details = this.fileDetails[i];
            if (details.type !== "text") {
                continue;
            }
            const diff = details.structuredPatch;

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

export class LoadingState {
    loading: boolean = $state(false);
    loadedCount: number = $state(0);
    totalCount: number | null = $state(0);
    readonly progressBar = $state(new ProgressBarState(null, 100));

    constructor() {
        watch([() => this.loadedCount, () => this.totalCount], ([loadedCount, totalCount]) => {
            if (totalCount === null || totalCount <= 0) {
                this.progressBar.setSpinning();
            } else {
                this.progressBar.setProgress(loadedCount, totalCount);
            }
        });
    }

    start() {
        this.loadedCount = 0;
        this.totalCount = null;
        this.progressBar.setSpinning();
        this.loading = true;
    }

    done() {
        this.loading = false;
    }
}

export interface ActiveSearchResult {
    file: FileDetails;
    idx: number;
}

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

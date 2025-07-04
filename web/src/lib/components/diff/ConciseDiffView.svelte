<script lang="ts" generics="K">
    import {
        type ConciseDiffViewProps,
        ConciseDiffViewState,
        innerPatchLineTypeProps,
        type InnerPatchLineTypeProps,
        makeSearchSegments,
        parseSinglePatch,
        type PatchLine,
        PatchLineType,
        type PatchLineTypeProps,
        patchLineTypeProps,
        type SearchSegment,
    } from "$lib/components/diff/concise-diff-view.svelte";
    import Spinner from "$lib/components/Spinner.svelte";
    import CommentThread from "./CommentThread.svelte";
    import CommentForm from "./CommentForm.svelte";
    import type { CommentThread as CommentThreadType } from "$lib/diff-viewer-multi-file.svelte";
    import { getGithubToken, type GithubPRComment } from "$lib/github.svelte";
    import { type StructuredPatch } from "diff";
    import { onDestroy } from "svelte";
    import { type MutableValue } from "$lib/util";
    import { box } from "svelte-toolbelt";

    let {
        rawPatchContent,
        patch,
        syntaxHighlighting = true,
        syntaxHighlightingTheme,
        omitPatchHeaderOnlyHunks = true,
        wordDiffs = true,
        lineWrap = true,
        searchQuery,
        searchMatchingLines,
        activeSearchResult = -1,
        cache,
        cacheKey,
        showComments = false,
        commentsForLine,
        onCommentAdded,
        onCommentUpdated,
        onCommentDeleted,
        filePath,
        owner,
        repo,
        prNumber,
    }: ConciseDiffViewProps<K> & {
        showComments?: boolean;
        commentsForLine?: (line: number, side: "LEFT" | "RIGHT") => CommentThreadType[];
        onCommentAdded?: (comment: GithubPRComment) => void;
        onCommentUpdated?: (comment: GithubPRComment) => void;
        onCommentDeleted?: (commentId: number) => void;
        filePath?: string;
        owner?: string;
        repo?: string;
        prNumber?: string;
    } = $props();

    const parsedPatch: Promise<StructuredPatch> = $derived.by(async () => {
        if (rawPatchContent !== undefined) {
            return parseSinglePatch(rawPatchContent);
        } else if (patch !== undefined) {
            return patch;
        }
        throw Error("Either rawPatchContent or patch must be provided");
    });

    const view = new ConciseDiffViewState({
        patch: box.with(() => parsedPatch),
        syntaxHighlighting: box.with(() => syntaxHighlighting),
        syntaxHighlightingTheme: box.with(() => syntaxHighlightingTheme),
        omitPatchHeaderOnlyHunks: box.with(() => omitPatchHeaderOnlyHunks),
        wordDiffs: box.with(() => wordDiffs),

        cache: box.with(() => cache),
        cacheKey: box.with(() => cacheKey),
    });

    let hoveredLineKey = $state<string | null>(null);
    let showNewCommentForm = $state<string | null>(null); // "line:side" format

    // Multiline comment selection state
    let isSelecting = $state(false);
    let selectionStart = $state<{ line: PatchLine; side: "LEFT" | "RIGHT" } | null>(null);
    let selectionEnd = $state<{ line: PatchLine; side: "LEFT" | "RIGHT" } | null>(null);
    let isDragging = $state(false);
    let dragThreshold = 5; // pixels
    let dragStartPosition = $state<{ x: number; y: number } | null>(null);

    const hasToken = $derived(!!getGithubToken());
    const canAddComments = $derived(showComments && hasToken && owner && repo && prNumber && filePath);

    function getDisplayLineNo(line: PatchLine, num: number | undefined) {
        if (line.type == PatchLineType.HEADER) {
            return "...";
        } else {
            return num ?? " ";
        }
    }

    function getLineKey(line: PatchLine, side: "LEFT" | "RIGHT"): string {
        const lineNum = side === "LEFT" ? line.oldLineNo : line.newLineNo;
        return `${lineNum}:${side}`;
    }

    function getLineNumber(line: PatchLine, side: "LEFT" | "RIGHT"): number | undefined {
        return side === "LEFT" ? line.oldLineNo : line.newLineNo;
    }

    function handleAddComment(line: PatchLine, side: "LEFT" | "RIGHT") {
        const lineKey = getLineKey(line, side);

        // If there's already a comment form open for a different line, close it and start new
        if (showNewCommentForm && showNewCommentForm !== lineKey) {
            showNewCommentForm = lineKey;
            clearSelection();
            return;
        }

        // Check if this is a multiline selection
        if (selectionStart && selectionEnd && (selectionStart.line !== selectionEnd.line || selectionStart.side !== selectionEnd.side)) {
            // Create multiline comment
            const startLineNum = getLineNumber(selectionStart.line, selectionStart.side);
            const endLineNum = getLineNumber(selectionEnd.line, selectionEnd.side);

            if (startLineNum !== undefined && endLineNum !== undefined) {
                // Ensure proper order (start should be before end)
                let actualStart = selectionStart;
                let actualEnd = selectionEnd;

                if (startLineNum > endLineNum || (startLineNum === endLineNum && selectionStart.side === "RIGHT" && selectionEnd.side === "LEFT")) {
                    actualStart = selectionEnd;
                    actualEnd = selectionStart;
                }

                // Update the selection state with the correct order
                selectionStart = actualStart;
                selectionEnd = actualEnd;

                showNewCommentForm = getLineKey(actualEnd.line, actualEnd.side);
                clearSelection();
                return;
            }
        }

        showNewCommentForm = lineKey;
        clearSelection();
    }

    function handleCommentFormCancel() {
        showNewCommentForm = null;
        clearSelection();
    }

    function handleCommentSubmitted(comment: GithubPRComment) {
        showNewCommentForm = null;
        clearSelection();
        onCommentAdded?.(comment);
    }

    function handleCommentUpdated(comment: GithubPRComment) {
        onCommentUpdated?.(comment);
    }

    function handleCommentDeleted(commentId: number) {
        onCommentDeleted?.(commentId);
    }

    // Mouse event handlers for drag selection
    function handleMouseDown(event: MouseEvent, line: PatchLine, side: "LEFT" | "RIGHT") {
        if (!canAddComments || line.type === PatchLineType.HEADER) return;

        const lineNum = getLineNumber(line, side);
        if (lineNum === undefined) return;

        // Store initial position for drag threshold
        dragStartPosition = { x: event.clientX, y: event.clientY };

        isSelecting = true;
        isDragging = false; // Don't set to true until we actually start dragging
        selectionStart = { line, side };
        selectionEnd = { line, side };
    }

    function handleMouseMove(event: MouseEvent, line: PatchLine, side: "LEFT" | "RIGHT") {
        if (!isSelecting || !canAddComments || line.type === PatchLineType.HEADER) return;

        const lineNum = getLineNumber(line, side);
        if (lineNum === undefined) return;

        // Check if we've moved far enough to start dragging
        if (!isDragging && dragStartPosition) {
            const dx = event.clientX - dragStartPosition.x;
            const dy = event.clientY - dragStartPosition.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > dragThreshold) {
                isDragging = true;
                event.preventDefault();
            }
        }

        if (isDragging) {
            selectionEnd = { line, side };
        }
    }

    function handleMouseUp() {
        if (!isSelecting) return;

        // If we were dragging and have a multiline selection, open comment form
        if (isDragging && selectionStart && selectionEnd && (selectionStart.line !== selectionEnd.line || selectionStart.side !== selectionEnd.side)) {
            // Open comment form for multiline selection
            const startLineNum = getLineNumber(selectionStart.line, selectionStart.side);
            const endLineNum = getLineNumber(selectionEnd.line, selectionEnd.side);

            if (startLineNum !== undefined && endLineNum !== undefined) {
                // Ensure proper order (start should be before end)
                let actualStart = selectionStart;
                let actualEnd = selectionEnd;

                // If dragging from bottom to top, swap the selection
                if (startLineNum > endLineNum || (startLineNum === endLineNum && selectionStart.side === "RIGHT" && selectionEnd.side === "LEFT")) {
                    actualStart = selectionEnd;
                    actualEnd = selectionStart;
                }

                // Update the selection state with the correct order
                selectionStart = actualStart;
                selectionEnd = actualEnd;

                showNewCommentForm = getLineKey(actualEnd.line, actualEnd.side);
                isSelecting = false;
                isDragging = false;
                dragStartPosition = null;
                return;
            }
        }

        // Otherwise clear selection
        clearSelection();
    }

    let searchResultElements: HTMLSpanElement[] = $state([]);
    let didInitialJump = $state(false);
    let scheduledJump: ReturnType<typeof setTimeout> | undefined = undefined;
    $effect(() => {
        if (didInitialJump) {
            return;
        }
        if (activeSearchResult >= 0 && searchResultElements[activeSearchResult] !== undefined) {
            const element = searchResultElements[activeSearchResult];
            const anchorElement = element.closest("tr");
            // This is an exceptionally stupid and unreliable hack, but at least
            // jumping to a result in a not-yet-loaded file works most of the time with a delay
            // instead of never.
            scheduledJump = setTimeout(() => {
                if (scheduledJump !== undefined) {
                    clearTimeout(scheduledJump);
                    scheduledJump = undefined;
                }

                if (anchorElement !== null) {
                    anchorElement.scrollIntoView({ block: "center", inline: "center" });
                }
            }, 200);
            didInitialJump = true;
        }
    });
    onDestroy(() => {
        if (scheduledJump !== undefined) {
            clearTimeout(scheduledJump);
            scheduledJump = undefined;
        }
    });

    let searchSegments: Promise<SearchSegment[][][]> = $derived.by(async () => {
        if (!searchQuery || !searchMatchingLines) {
            return [];
        }
        const matchingLines = await searchMatchingLines();
        if (!matchingLines || matchingLines.length === 0) {
            return [];
        }
        const diffViewerPatch = await view.diffViewerPatch;
        const hunks = diffViewerPatch.hunks;
        const segments: SearchSegment[][][] = [];
        const count: MutableValue<number> = { value: 0 };
        for (let i = 0; i < hunks.length; i++) {
            const hunkMatchingLines = matchingLines[i];
            if (!hunkMatchingLines || hunkMatchingLines.length === 0) {
                continue;
            }

            const hunkSegments: SearchSegment[][] = [];
            segments[i] = hunkSegments;

            const hunkLines = hunks[i].lines;
            for (let j = 0; j < hunkLines.length; j++) {
                const line = hunkLines[j];

                let lineText = "";
                for (let k = 0; k < line.content.length; k++) {
                    const segmentText = line.content[k].text;
                    if (segmentText) {
                        lineText += segmentText;
                    }
                }

                // -1 for the hunk header
                if (hunkMatchingLines.includes(j - 1)) {
                    hunkSegments[j] = makeSearchSegments(searchQuery, lineText, count);
                }
            }
        }
        return segments;
    });

    function isLineInSelection(line: PatchLine, side: "LEFT" | "RIGHT"): boolean {
        if (!selectionStart || !selectionEnd) return false;

        const lineNum = getLineNumber(line, side);
        if (lineNum === undefined) return false;

        const startLineNum = getLineNumber(selectionStart.line, selectionStart.side);
        const endLineNum = getLineNumber(selectionEnd.line, selectionEnd.side);

        if (startLineNum === undefined || endLineNum === undefined) return false;

        // Determine actual start and end (handle both directions)
        let actualStartLineNum = startLineNum;
        let actualEndLineNum = endLineNum;
        let actualStartSide = selectionStart.side;
        let actualEndSide = selectionEnd.side;

        // If dragging from bottom to top, swap the order
        if (startLineNum > endLineNum || (startLineNum === endLineNum && selectionStart.side === "RIGHT" && selectionEnd.side === "LEFT")) {
            actualStartLineNum = endLineNum;
            actualEndLineNum = startLineNum;
            actualStartSide = selectionEnd.side;
            actualEndSide = selectionStart.side;
        }

        // For same side selection
        if (actualStartSide === actualEndSide && side === actualStartSide) {
            return lineNum >= actualStartLineNum && lineNum <= actualEndLineNum;
        }

        // For cross-side selection (left to right or right to left)
        if (actualStartSide !== actualEndSide) {
            if (side === actualStartSide) {
                return lineNum >= actualStartLineNum;
            } else if (side === actualEndSide) {
                return lineNum <= actualEndLineNum;
            }
        }

        return false;
    }

    function clearSelection() {
        isSelecting = false;
        selectionStart = null;
        selectionEnd = null;
        isDragging = false;
        dragStartPosition = null;
    }

    function handleClick(event: MouseEvent, line: PatchLine, side: "LEFT" | "RIGHT") {
        // Don't handle click if we just finished dragging
        if (isDragging) {
            event.preventDefault();
            return;
        }

        // Don't handle click if there's a multiline selection (from drag)
        if (selectionStart && selectionEnd && (selectionStart.line !== selectionEnd.line || selectionStart.side !== selectionEnd.side)) {
            event.preventDefault();
            return;
        }

        handleAddComment(line, side);
    }
</script>

<svelte:window onmouseup={handleMouseUp} />

{#snippet lineContent(line: PatchLine, lineType: PatchLineTypeProps, innerLineType: InnerPatchLineTypeProps)}
    <span class="prefix inline leading-[0.875rem]" style={innerLineType.style} data-prefix={lineType.prefix}>
        {#if line.lineBreak}<br />{:else}
            {#each line.content as segment, index (index)}
                {@const iconClass = segment.iconClass}
                {#if iconClass}
                    <span class="inline-block ps-0.5 {segment.classes ?? ''}" aria-label={segment.caption}>
                        <span class="iconify size-4 align-middle {iconClass}" aria-hidden="true"></span>
                    </span>
                {:else}<span class="inline {segment.classes ?? ''}" style={segment.style ?? ""}>{segment.text}</span>{/if}
            {/each}
        {/if}
    </span>
{/snippet}

{#snippet lineContentWrapper(line: PatchLine, hunkIndex: number, lineIndex: number, lineType: PatchLineTypeProps, innerLineType: InnerPatchLineTypeProps)}
    {#await searchSegments}
        {@render lineContent(line, lineType, innerLineType)}
    {:then completedSearchSegments}
        {@const hunkSearchSegments = completedSearchSegments[hunkIndex]}
        {#if hunkSearchSegments !== undefined && hunkSearchSegments.length > 0}
            {@const lineSearchSegments = hunkSearchSegments[lineIndex]}
            {#if lineSearchSegments !== undefined && lineSearchSegments.length > 0}
                <div class="relative">
                    {@render lineContent(line, lineType, innerLineType)}
                    <span class="pointer-events-none absolute top-0 left-0 text-transparent select-none">
                        <span class="inline leading-[0.875rem]">
                            {#each lineSearchSegments as searchSegment, index (index)}
                                {#if searchSegment.highlighted}<span
                                        bind:this={searchResultElements[searchSegment.id ?? -1]}
                                        class={{
                                            "bg-[#d4a72c66]": searchSegment.id !== activeSearchResult,
                                            "bg-[#ff9632]": searchSegment.id === activeSearchResult,
                                            "text-em-high-light": searchSegment.id === activeSearchResult,
                                        }}
                                        data-match-id={searchSegment.id}>{searchSegment.text}</span
                                    >{:else}{searchSegment.text}{/if}
                            {/each}
                        </span>
                    </span>
                </div>
            {:else}
                {@render lineContent(line, lineType, innerLineType)}
            {/if}
        {:else}
            {@render lineContent(line, lineType, innerLineType)}
        {/if}
    {/await}
{/snippet}

{#snippet commentButton(line: PatchLine, side: "LEFT" | "RIGHT")}
    {@const lineKey = getLineKey(line, side)}
    {@const lineNum = getLineNumber(line, side)}
    {@const isSelected = isLineInSelection(line, side)}
    {#if canAddComments && lineNum !== undefined && line.type !== PatchLineType.HEADER}
        <button
            class="comment-button"
            aria-label="Add comment"
            class:visible={hoveredLineKey === lineKey || isSelected}
            class:selected={isSelected}
            onmousedown={(e) => handleMouseDown(e, line, side)}
            onmousemove={(e) => handleMouseMove(e, line, side)}
            onclick={(e) => handleClick(e, line, side)}
            title={isSelected ? "Add multiline comment" : "Add comment"}
        >
            <span class="iconify octicon--plus-16"></span>
        </button>
    {/if}
{/snippet}

{#snippet renderLine(line: PatchLine, hunkIndex: number, lineIndex: number)}
    {@const lineType = patchLineTypeProps[line.type]}
    {@const leftLineKey = getLineKey(line, "LEFT")}
    {@const rightLineKey = getLineKey(line, "RIGHT")}
    {@const leftSelected = isLineInSelection(line, "LEFT")}
    {@const rightSelected = isLineInSelection(line, "RIGHT")}
    <div
        class="line-cell relative bg-[var(--hunk-header-bg)]"
        class:line-selected={leftSelected}
        onmouseenter={() => (hoveredLineKey = leftLineKey)}
        onmouseleave={() => (hoveredLineKey = null)}
        aria-label="Add comment"
        role="button"
        tabindex="0"
    >
        <div class="line-number select-none {lineType.lineNoClasses}">{getDisplayLineNo(line, line.oldLineNo)}</div>
        {@render commentButton(line, "LEFT")}
    </div>
    <div
        class="line-cell relative bg-[var(--hunk-header-bg)]"
        class:line-selected={rightSelected}
        onmouseenter={() => (hoveredLineKey = rightLineKey)}
        onmouseleave={() => (hoveredLineKey = null)}
        aria-label="Add comment"
        role="button"
        tabindex="0"
    >
        <div class="line-number select-none {lineType.lineNoClasses}">{getDisplayLineNo(line, line.newLineNo)}</div>
        {@render commentButton(line, "RIGHT")}
    </div>
    <div class="w-full pl-[1rem] {lineType.classes}" class:line-selected={leftSelected || rightSelected}>
        {@render lineContentWrapper(line, hunkIndex, lineIndex, lineType, innerPatchLineTypeProps[line.innerPatchLineType])}
    </div>
{/snippet}

{#snippet renderComments(line: PatchLine)}
    {#if showComments && commentsForLine && filePath}
        {@const leftLineNum = line.oldLineNo}
        {@const rightLineNum = line.newLineNo}
        {@const leftComments = leftLineNum ? commentsForLine(leftLineNum, "LEFT") : []}
        {@const rightComments = rightLineNum ? commentsForLine(rightLineNum, "RIGHT") : []}
        {@const allComments = [...leftComments, ...rightComments]}

        {#if allComments.length > 0}
            <div class="comment-row">
                <div class="comment-spacer"></div>
                <div class="comment-spacer"></div>
                <div class="comments-container">
                    {#each allComments as thread (thread.id)}
                        <CommentThread
                            {thread}
                            owner={owner ?? ""}
                            repo={repo ?? ""}
                            prNumber={prNumber ?? ""}
                            onCommentAdded={handleCommentSubmitted}
                            onCommentUpdated={handleCommentUpdated}
                            onCommentDeleted={handleCommentDeleted}
                        />
                    {/each}
                </div>
            </div>
        {/if}

        {#if showNewCommentForm}
            {@const leftKey = getLineKey(line, "LEFT")}
            {@const rightKey = getLineKey(line, "RIGHT")}
            {#if showNewCommentForm === leftKey || showNewCommentForm === rightKey}
                {@const isLeft = showNewCommentForm === leftKey}
                {@const lineNum = isLeft ? line.oldLineNo : line.newLineNo}
                {@const currentSide = isLeft ? "LEFT" : "RIGHT"}
                {#if lineNum !== undefined}
                    {@const startLineNum = selectionStart ? getLineNumber(selectionStart.line, selectionStart.side) : undefined}
                    {@const startSide = selectionStart?.side}
                    {@const hasMultilineSelection =
                        selectionStart && selectionEnd && (selectionStart.line !== selectionEnd.line || selectionStart.side !== selectionEnd.side)}
                    <div class="comment-row">
                        <div class="comment-spacer"></div>
                        <div class="comment-spacer"></div>
                        <div class="comments-container">
                            <CommentForm
                                owner={owner ?? ""}
                                repo={repo ?? ""}
                                prNumber={prNumber ?? ""}
                                path={filePath}
                                line={lineNum}
                                side={currentSide}
                                startLine={hasMultilineSelection ? startLineNum : undefined}
                                startSide={hasMultilineSelection ? startSide : undefined}
                                onSubmit={handleCommentSubmitted}
                                onCancel={handleCommentFormCancel}
                            />
                        </div>
                    </div>
                {/if}
            {/if}
        {/if}
    {/if}
{/snippet}

{#await Promise.all([view.rootStyle, view.diffViewerPatch])}
    <div class="flex items-center justify-center bg-neutral-2 p-4"><Spinner /></div>
{:then [rootStyle, diffViewerPatch]}
    <div
        style={rootStyle}
        class="diff-content text-patch-line w-full bg-[var(--editor-bg)] font-mono text-xs leading-[1.25rem] text-[var(--editor-fg)] selection:bg-[var(--select-bg)]"
        data-wrap={lineWrap}
    >
        {#each diffViewerPatch.hunks as hunk, hunkIndex (hunkIndex)}
            {#each hunk.lines as line, lineIndex (lineIndex)}
                {@render renderLine(line, hunkIndex, lineIndex)}
                {@render renderComments(line)}
            {/each}
        {/each}
    </div>
{/await}

<style>
    .diff-content {
        --editor-fg: var(--editor-fg-themed, var(--color-em-high));
        /* TODO: better fallback, remove dark mode override */
        --select-bg: var(--select-bg-themed, var(--color-blue-300));
        --editor-bg: var(--editor-bg-themed, var(--color-neutral));

        --inserted-text-bg: var(--inserted-text-bg-themed, initial);
        --removed-text-bg: var(--removed-text-bg-themed, initial);
        --inserted-line-bg: var(--inserted-line-bg-themed, initial);
        --removed-line-bg: var(--removed-line-bg-themed, initial);
        --inner-inserted-line-bg: var(--inner-inserted-line-bg-themed, initial);
        --inner-removed-line-bg: var(--inner-removed-line-bg-themed, initial);
        --inner-inserted-line-fg: var(--inner-inserted-line-fg-themed, initial);
        --inner-removed-line-fg: var(--inner-removed-line-fg-themed, initial);

        --color-editor-bg-600: oklch(0.6 var(--editor-background-c) var(--editor-background-h));
        --color-editor-fg-200: oklch(calc(max(0.9, var(--editor-foreground-l))) var(--editor-foreground-c) var(--editor-foreground-h));
        --hunk-header-bg: var(--hunk-header-bg-themed, var(--color-editor-bg-600, var(--color-gray-200)));
        --hunk-header-fg: var(--hunk-header-fg-themed, var(--editor-fg));

        display: grid;
        grid-template-columns: min-content min-content auto;
    }
    .diff-content[data-wrap="true"] {
        word-break: break-all;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
    }
    .diff-content[data-wrap="false"] {
        word-break: keep-all;
        overflow-wrap: normal;
        white-space: pre;
        overflow-x: auto;
    }

    .line-number {
        text-align: end;
        vertical-align: top;
        text-wrap: nowrap;
        position: relative;
        z-index: 0;
        padding: 0 24px 0 8px;
    }

    .prefix {
        position: relative;
    }
    .prefix::before {
        content: attr(data-prefix);
        position: absolute;
        left: -0.75rem;
        top: 0;
    }

    .line-cell {
        position: relative;
        line-height: 1.25rem;
        min-height: 1.25rem;
        max-height: 1.25rem;
        overflow: visible;
        z-index: 1;
    }

    .line-cell.line-selected {
        background: var(--color-blue-100) !important;
        border: 1px solid var(--color-blue-300);
        border-radius: 2px;
    }

    .line-selected {
        background: var(--color-blue-50) !important;
    }

    .comment-button {
        position: absolute;
        top: 50%;
        right: 2px;
        transform: translateY(-50%);
        background: var(--color-primary);
        border: none;
        border-radius: 50%;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s ease;
        color: white;
        font-size: 10px;
        z-index: 10;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    .comment-button.visible {
        opacity: 1;
    }

    .comment-button.selected {
        opacity: 1;
        background: var(--color-blue-600);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    }

    .comment-button:hover {
        background: var(--color-primary-hover);
    }

    .comment-button.selected:hover {
        background: var(--color-blue-700);
    }

    .comment-row {
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: subgrid;
        background: var(--color-neutral-1);
        border-top: 1px solid var(--color-border);
        border-bottom: 1px solid var(--color-border);
    }

    .comment-spacer {
        background: var(--color-neutral-2);
        border-right: 1px solid var(--color-border);
    }

    .comments-container {
        padding: 2px 6px;
        background: var(--color-neutral-1);
    }
</style>

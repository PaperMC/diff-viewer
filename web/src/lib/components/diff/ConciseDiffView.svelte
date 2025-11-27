<script lang="ts" generics="K">
    import {
        type ConciseDiffViewProps,
        ConciseDiffViewState,
        type DiffViewerPatchHunk,
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
    import { type MutableValue } from "$lib/util";
    import { box } from "svelte-toolbelt";
    import { boolAttr } from "runed";

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
        jumpToSearchResult = $bindable(false),
        cache,
        cacheKey,
        unresolvedSelection,
        selection = $bindable(),
        jumpToSelection = $bindable(false),
    }: ConciseDiffViewProps<K> = $props();

    const uid = $props.id();

    const parsedPatch = $derived.by(() => {
        if (rawPatchContent !== undefined) {
            return parseSinglePatch(rawPatchContent);
        } else if (patch !== undefined) {
            return patch;
        }
        throw Error("Either rawPatchContent or patch must be provided");
    });

    const view = new ConciseDiffViewState({
        rootElementId: uid,

        patch: box.with(() => parsedPatch),
        syntaxHighlighting: box.with(() => syntaxHighlighting),
        syntaxHighlightingTheme: box.with(() => syntaxHighlightingTheme),
        omitPatchHeaderOnlyHunks: box.with(() => omitPatchHeaderOnlyHunks),
        wordDiffs: box.with(() => wordDiffs),

        unresolvedSelection: box.with(() => unresolvedSelection),
        selection: box.with(
            () => selection,
            (v) => (selection = v),
        ),

        cache: box.with(() => cache),
        cacheKey: box.with(() => cacheKey),
    });

    function getDisplayLineNo(line: PatchLine, num: number | undefined) {
        if (line.type == PatchLineType.HEADER) {
            return "...";
        } else {
            return num ?? " ";
        }
    }

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

    let selectionMidpoint = $derived.by(() => {
        if (!selection) return null;
        const startIdx = selection.start.idx;
        const endIdx = selection.end.idx;
        return Math.floor((startIdx + endIdx) / 2);
    });

    let heightEstimateRem = $derived.by(() => {
        if (!parsedPatch) return 1.25;
        const rawLineCount = parsedPatch.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
        const headerAndSpacerLines = parsedPatch.hunks.length * 2;
        const totalLines = rawLineCount + headerAndSpacerLines;
        return totalLines * 1.25;
    });
</script>

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
                                        {@attach (element) => {
                                            if (jumpToSearchResult && searchSegment.id === activeSearchResult) {
                                                element.scrollIntoView({ block: "center", inline: "center" });
                                                jumpToSearchResult = false;
                                                // See similar code & comment below around jumping to selections
                                                //const scheduledJump = setTimeout(() => {
                                                //    jumpToSearchResult = false;
                                                //    element.scrollIntoView({ block: "center", inline: "center" });
                                                //}, 200);
                                                //return () => {
                                                //    jumpToSearchResult = false;
                                                //    clearTimeout(scheduledJump);
                                                //};
                                            }
                                        }}
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

{#snippet renderLine(line: PatchLine, hunk: DiffViewerPatchHunk, hunkIndex: number, lineIndex: number)}
    {@const lineType = patchLineTypeProps[line.type]}
    <div class="bg-[var(--hunk-header-bg)]" data-hunk-idx={hunkIndex} data-line-idx={lineIndex} {@attach view.selectable(hunk, hunkIndex, line, lineIndex)}>
        <div class="line-number h-full px-2 select-none {lineType.lineNoClasses}">{getDisplayLineNo(line, line.oldLineNo)}</div>
    </div>
    <div class="bg-[var(--hunk-header-bg)]" data-hunk-idx={hunkIndex} data-line-idx={lineIndex} {@attach view.selectable(hunk, hunkIndex, line, lineIndex)}>
        <div
            class="selected-indicator line-number h-full px-2 select-none {lineType.lineNoClasses}"
            data-selected={boolAttr(view.isSelected(hunkIndex, lineIndex))}
        >
            {getDisplayLineNo(line, line.newLineNo)}
        </div>
    </div>
    <div
        class="selected-indicator w-full pl-[1rem] {lineType.classes}"
        data-hunk-idx={hunkIndex}
        data-line-idx={lineIndex}
        data-selection-start={boolAttr(view.isSelectionStart(hunkIndex, lineIndex))}
        data-selection-end={boolAttr(view.isSelectionEnd(hunkIndex, lineIndex))}
        {@attach (element) => {
            if (jumpToSelection && selection && selection.hunk === hunkIndex && selectionMidpoint === lineIndex) {
                element.scrollIntoView({ block: "center", inline: "center" });
                jumpToSelection = false;
                // Need to schedule because otherwise the vlist rendering surrounding elements may shift things
                // and cause the element to scroll to the wrong position
                // This is not 100% reliable but is good enough for now
                //const scheduledJump = setTimeout(() => {
                //    jumpToSelection = false;
                //    element.scrollIntoView({ block: "center", inline: "center" });
                //}, 200);
                //return () => {
                //    if (scheduledJump) {
                //        jumpToSelection = false;
                //        clearTimeout(scheduledJump);
                //    }
                //};
            }
        }}
    >
        {@render lineContentWrapper(line, hunkIndex, lineIndex, lineType, innerPatchLineTypeProps[line.innerPatchLineType])}
    </div>
{/snippet}

{#await Promise.all([view.rootStyle, view.diffViewerPatch])}
    <div class="relative bg-neutral-2" style="min-height: {heightEstimateRem}rem;">
        <!-- 2.25 rem for file header offset -->
        <div class="sticky top-[2.25rem] flex items-center justify-center p-4">
            <Spinner />
        </div>
    </div>
{:then [rootStyle, diffViewerPatch]}
    <div
        id={uid}
        style={rootStyle}
        class="diff-content text-patch-line w-full bg-[var(--editor-bg)] font-mono text-xs leading-[1.25rem] text-[var(--editor-fg)] selection:bg-[var(--select-bg)]"
        data-wrap={lineWrap}
    >
        {#each diffViewerPatch.hunks as hunk, hunkIndex (hunkIndex)}
            {#each hunk.lines as line, lineIndex (lineIndex)}
                {@render renderLine(line, hunk, hunkIndex, lineIndex)}
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

    .selected-indicator[data-selected] {
        box-shadow: inset -4px 0 0 0 var(--hunk-header-fg);
    }
    .selected-indicator[data-selection-start] {
        box-shadow: inset 0 1px 0 0 var(--hunk-header-fg);
    }
    .selected-indicator[data-selection-end] {
        box-shadow: inset 0 -1px 0 0 var(--hunk-header-fg);
    }
    .selected-indicator[data-selection-start][data-selection-end] {
        box-shadow:
            inset 0 1px 0 0 var(--hunk-header-fg),
            inset 0 -1px 0 0 var(--hunk-header-fg);
    }
</style>

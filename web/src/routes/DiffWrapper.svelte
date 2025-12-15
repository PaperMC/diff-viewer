<script lang="ts">
    import ConciseDiffView from "$lib/components/diff/ConciseDiffView.svelte";
    import { MultiFileDiffViewerState, requireEitherImage, type FileDetails, type ImageDiffDetails } from "$lib/diff-viewer.svelte";
    import Spinner from "$lib/components/Spinner.svelte";
    import ImageDiff from "$lib/components/diff/ImageDiff.svelte";
    import AddedOrRemovedImage from "$lib/components/diff/AddedOrRemovedImage.svelte";
    import { GlobalOptions } from "$lib/global-options.svelte";

    interface Props {
        index: number;
        value: FileDetails;
    }

    let { index, value }: Props = $props();

    const viewer = MultiFileDiffViewerState.get();
    const globalOptions = GlobalOptions.get();

    let collapsed = $derived(viewer.fileStates[index].collapsed);
    let emptyTextDiff = $derived(value.type === "text" && value.patchHeaderDiffOnly && globalOptions.omitPatchHeaderOnlyHunks);
</script>

{#snippet imageDiff(image: ImageDiffDetails)}
    {#if image.fileA !== null && image.fileB !== null}
        {#await Promise.all([image.fileA.getValue(), image.fileB.getValue()])}
            <div class="flex items-center justify-center bg-neutral-2 p-4"><Spinner /></div>
        {:then images}
            <ImageDiff fileA={images[0]} fileB={images[1]} />
        {/await}
    {:else}
        {#await requireEitherImage(image).getValue()}
            <div class="flex items-center justify-center bg-neutral-2 p-4"><Spinner /></div>
        {:then file}
            <AddedOrRemovedImage {file} mode={image.fileA === null ? "add" : "remove"} />
        {/await}
    {/if}
{/snippet}

{#if value.type === "image" && !collapsed}
    {@const image = value.image}
    <div class="border-b text-sm">
        {#if image.load}
            {@render imageDiff(image)}
        {:else}
            <div class="flex justify-center bg-neutral-2 p-4">
                <button
                    type="button"
                    class=" flex flex-row items-center justify-center gap-1 rounded-md btn-fill-primary px-2 py-1"
                    onclick={() => (image.load = true)}
                >
                    <span class="iconify size-4 shrink-0 octicon--image-16"></span><span>Load image diff</span>
                </button>
            </div>
        {/if}
    </div>
{/if}
{#if value.type === "text" && !collapsed && !emptyTextDiff}
    <div class="border-b">
        <ConciseDiffView
            patch={value.structuredPatch}
            syntaxHighlighting={globalOptions.syntaxHighlighting}
            syntaxHighlightingTheme={globalOptions.syntaxHighlightingTheme}
            omitPatchHeaderOnlyHunks={globalOptions.omitPatchHeaderOnlyHunks}
            wordDiffs={globalOptions.wordDiffs}
            lineWrap={globalOptions.lineWrap}
            searchQuery={viewer.searchQueryDebounced.current}
            searchMatchingLines={() => viewer.searchResults.then((r) => r.lines.get(value))}
            activeSearchResult={viewer.activeSearchResult && viewer.activeSearchResult.file === value ? viewer.activeSearchResult.idx : undefined}
            bind:jumpToSearchResult={viewer.jumpToSearchResult}
            cache={viewer.diffViewCache}
            cacheKey={value}
            unresolvedSelection={viewer.getSelection(value)?.unresolvedLines}
            bind:selection={
                () => viewer.getSelection(value)?.lines,
                (lines) => {
                    if (lines === undefined && viewer.selection?.file === value) {
                        viewer.clearSelection();
                    } else {
                        viewer.setSelection(value, lines);
                    }
                }
            }
            bind:jumpToSelection={viewer.jumpToSelection}
        />
    </div>
{/if}

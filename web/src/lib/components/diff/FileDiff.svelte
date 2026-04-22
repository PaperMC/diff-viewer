<script lang="ts">
    import Spinner from "$lib/components/Spinner.svelte";
    import AddedOrRemovedImage from "$lib/components/diff/AddedOrRemovedImage.svelte";
    import ImageDiff from "$lib/components/diff/ImageDiff.svelte";
    import TextDiff from "$lib/components/diff/TextDiff.svelte";
    import { MultiFileDiffViewerState, requireEitherImage, type FileDetails, type ImageDiffDetails } from "$lib/diff-viewer.svelte";
    import { GlobalOptions } from "$lib/global-options.svelte";

    interface Props {
        file: FileDetails;
    }

    let { file }: Props = $props();

    const viewer = MultiFileDiffViewerState.get();
    const globalOptions = GlobalOptions.get();

    let collapsed = $derived(viewer.fileStates[file.index].collapsed);
    let emptyTextDiff = $derived(file.type === "text" && file.patchHeaderDiffOnly && globalOptions.omitPatchHeaderOnlyHunks);
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

{#if file.type === "image" && !collapsed}
    {@const image = file.image}
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
{#if file.type === "text" && !collapsed && !emptyTextDiff}
    <div class="border-b">
        <TextDiff {file} />
    </div>
{/if}

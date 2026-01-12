<script lang="ts">
    import { MultiFileDiffViewerState } from "$lib/diff-viewer.svelte";
    import { Button } from "bits-ui";

    const viewer = MultiFileDiffViewerState.get();
    let isFiltered = $derived.by(() => {
        if (viewer.diffMetadata === null) {
            return false;
        }
        return viewer.fileDetails.length !== viewer.filteredFileDetails.array.length;
    });
</script>

{#if isFiltered}
    <Button.Root
        class="rounded-sm btn-fill-neutral border px-1 py-0.5 text-sm leading-none"
        onclick={() => {
            viewer.openDialog("diff-filter");
        }}
    >
        Filtered
    </Button.Root>
{/if}

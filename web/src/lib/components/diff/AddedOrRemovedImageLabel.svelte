<script lang="ts">
    import { type ImageDimensions } from "$lib/image";
    import type { AddOrRemove } from "$lib/diff-viewer.svelte";

    interface Props {
        dims: Promise<ImageDimensions> | ImageDimensions;
        mode: AddOrRemove;
    }

    const { dims, mode }: Props = $props();

    let iconClasses = $derived(mode === "add" ? "octicon--file-added-16 text-green-600" : "octicon--file-removed-16 text-red-600");
</script>

<div class="flex flex-col items-center justify-center rounded-sm bg-neutral p-2 shadow-sm">
    <span class="iconify size-4 {iconClasses} mb-1"></span>
    {#await dims then { width, height }}
        <span class="text-xs"><span class="font-semibold">W:</span> {width}px</span>
        <span class="text-xs"><span class="font-semibold">H:</span> {height}px</span>
    {/await}
</div>

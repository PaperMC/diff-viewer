<script lang="ts">
    import { getDimensions } from "$lib/image";
    import AddedOrRemovedImageLabel from "$lib/components/diff/AddedOrRemovedImageLabel.svelte";
    import type { AddOrRemove } from "$lib/diff-viewer.svelte";

    interface Props {
        file: string;
        mode: AddOrRemove;
    }

    const { file, mode }: Props = $props();

    let borderColor = $derived(mode === "add" ? "border-green-600" : "border-red-600");
    let dims = $derived(getDimensions(file));
</script>

<div class="grid w-full grid-cols-1 gap-4 bg-neutral-2 p-4">
    <div class="flex flex-col items-center justify-center gap-4">
        <img src={file} alt={mode} class="png-bg h-auto border-2 {borderColor} shadow-md" />
        <AddedOrRemovedImageLabel {mode} {dims} />
    </div>
</div>

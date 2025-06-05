<script lang="ts">
    import DirectoryInput from "$lib/components/files/DirectoryInput.svelte";
    import { type DirectoryEntry } from "$lib/components/files/index.svelte";

    interface Props {
        placeholder: string;
        directory?: DirectoryEntry;
    }

    let { placeholder = "Select Directory", directory = $bindable<DirectoryEntry | undefined>(undefined) }: Props = $props();
</script>

<DirectoryInput class="flex items-center gap-2 rounded-md border btn-ghost px-2 py-1" bind:directory>
    {#snippet children({ directory })}
        <span class="iconify size-4 shrink-0 text-em-disabled octicon--file-directory-16"></span>
        {#if directory}
            {directory.fileName}
        {:else}
            <span class="font-light">{placeholder}</span>
        {/if}
        <span class="iconify size-4 shrink-0 text-em-disabled octicon--triangle-down-16"></span>
    {/snippet}
</DirectoryInput>

<script lang="ts">
    import DirectoryInput from "$lib/components/files/DirectoryInput.svelte";
    import { type DirectoryEntry } from "$lib/components/files/index.svelte";
    import Spinner from "$lib/components/Spinner.svelte";

    interface Props {
        placeholder: string;
        directory?: DirectoryEntry;
    }

    let { placeholder = "Select Directory", directory = $bindable<DirectoryEntry | undefined>(undefined) }: Props = $props();
</script>

<DirectoryInput class="flex max-w-full items-center gap-2 rounded-md btn-fill-neutral px-2 py-1" bind:directory>
    {#snippet children({ directory, picking })}
        <span class="iconify size-4 shrink-0 text-em-med octicon--file-directory-16"></span>
        {#if picking}
            <span>Picking {placeholder}...</span><Spinner size={4} />
        {:else if directory}
            <span class="truncate">{directory.fileName}</span>
        {:else}
            <span>Pick {placeholder}</span>
        {/if}
        <span class="iconify size-4 shrink-0 text-em-med octicon--triangle-down-16"></span>
    {/snippet}
</DirectoryInput>

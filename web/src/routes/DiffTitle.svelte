<script lang="ts">
    import type { DiffMetadata } from "$lib/diff-viewer-multi-file.svelte";
    import type { GithubDiff } from "$lib/github.svelte";

    interface Props {
        meta: DiffMetadata;
    }

    let { meta }: Props = $props();
</script>

{#snippet github(details: GithubDiff)}
    <div>
        <div class="flex gap-2">
            <span class="iconify size-6 shrink-0 octicon--mark-github-24"></span>
            <h1 class="text-base">{details.owner}<span class="mx-1.5 font-light text-em-med">/</span>{details.repo}</h1>
        </div>
        <h2 class="text-sm text-em-med">
            <a href={details.backlink} target="_blank" rel="noopener noreferrer" class="hover:text-primary">{details.description}</a>
        </h2>
    </div>
{/snippet}

{#snippet file(fileName: string)}
    <div class="flex gap-2">
        <span class="iconify size-6 shrink-0 octicon--file-diff-24"></span>
        <h1 class="text-base">{fileName}</h1>
    </div>
{/snippet}

{#if meta.type === "github"}
    {@render github(meta.details)}
{/if}
{#if meta.type === "file"}
    {@render file(meta.fileName)}
{/if}

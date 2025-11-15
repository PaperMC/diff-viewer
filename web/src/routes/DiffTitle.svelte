<script lang="ts">
    import type { DiffMetadata } from "$lib/diff-viewer.svelte";
    import type { GithubDiff } from "$lib/github.svelte";

    interface Props {
        meta: DiffMetadata;
    }

    let { meta }: Props = $props();
</script>

{#snippet github(details: GithubDiff)}
    <div class="max-w-full">
        <div class="flex gap-2">
            <span class="iconify size-4 shrink-0 place-self-center octicon--mark-github-16"></span>
            <h1 class="text-sm">{details.owner}<span class="mx-1.5 font-light text-em-med">/</span>{details.repo}</h1>
        </div>
        <h2 class="text-sm text-em-med">
            <a href={details.backlink} target="_blank" rel="noopener noreferrer" class="hover:text-primary">{details.description}</a>
        </h2>
    </div>
{/snippet}

{#snippet file(fileName: string)}
    <div class="flex max-w-full gap-2">
        <span class="iconify size-4 shrink-0 place-self-center octicon--file-diff-16"></span>
        <h1 class="text-sm wrap-anywhere break-keep">{fileName}</h1>
    </div>
{/snippet}

{#if meta.type === "github"}
    {@render github(meta.details)}
{/if}
{#if meta.type === "file"}
    {@render file(meta.fileName)}
{/if}

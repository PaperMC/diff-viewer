<script lang="ts">
    import { useId, Label } from "bits-ui";
    import type { Snippet } from "svelte";

    interface Props {
        title: string;
        children?: Snippet<[]>;
    }

    let { children, title }: Props = $props();

    let groupId = useId();
    let labelId = useId();
</script>

{#snippet renderChildren()}
    {#if children}
        {@render children()}
    {/if}
{/snippet}

<div id={groupId} aria-labelledby={labelId} class="flex flex-col" role="group">
    <Label.Root id={labelId} for={groupId} class="px-2 py-1 text-lg font-semibold">{title}</Label.Root>
    {@render renderChildren()}
</div>

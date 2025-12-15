<script lang="ts">
    import { Label, RadioGroup } from "bits-ui";
    import { capitalizeFirstLetter } from "$lib/util";
    import type { RestProps } from "$lib/types";

    interface Props extends RestProps {
        value: string;
        values: string[];
    }

    let { value = $bindable(), values, ...restProps }: Props = $props();

    const uid = $props.id();
</script>

{#snippet item(value: string)}
    {@const labelId = `${uid}-${value}-label`}
    {@const itemId = `${uid}-${value}-item`}
    <Label.Root id={labelId} for={itemId} class="flex cursor-pointer flex-row items-center gap-1 text-sm">
        <RadioGroup.Item
            class="flex size-4 cursor-pointer items-center justify-center rounded-full border btn-ghost"
            {value}
            id={itemId}
            aria-labelledby={labelId}
        >
            {#snippet children({ checked })}
                {#if checked}
                    <span class="size-2.5 rounded-full bg-blue-500" aria-hidden="true"></span>
                {/if}
            {/snippet}
        </RadioGroup.Item>
        {capitalizeFirstLetter(value)}
    </Label.Root>
{/snippet}

<RadioGroup.Root class="flex flex-row items-center gap-2" bind:value {...restProps}>
    {#each values as value (value)}
        {@render item(value)}
    {/each}
</RadioGroup.Root>

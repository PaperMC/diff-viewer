<script module>
    export { globalThemeSetting, sectionHeader };
</script>

<script lang="ts">
    import SettingsPopoverGroup from "./SettingsPopoverGroup.svelte";
    import type { RestProps } from "$lib/types";
    import { mergeProps, Popover, type WithChildren } from "bits-ui";
    import SimpleRadioGroup from "$lib/components/settings-popover/SimpleRadioGroup.svelte";
    import { getGlobalTheme, setGlobalTheme } from "$lib/theme.svelte";

    let { children, ...restProps }: WithChildren<RestProps> = $props();

    const defTriggerProps = {
        title: "Settings",
        class: "size-6 rounded-md flex items-center justify-center text-primary btn-ghost data-[state=open]:btn-ghost-visible",
    };

    let triggerProps = $derived(mergeProps(defTriggerProps, restProps));
</script>

{#snippet sectionHeader(text: string)}
    <div class="mt-4 font-semibold">{text}</div>
{/snippet}

{#snippet globalThemeSetting()}
    <SettingsPopoverGroup title="Theme">
        <div class="px-2 py-1">
            <SimpleRadioGroup values={["light", "dark", "auto"]} bind:value={getGlobalTheme, setGlobalTheme} aria-label="Select theme" />
        </div>
    </SettingsPopoverGroup>
{/snippet}

<Popover.Root>
    <Popover.Trigger {...triggerProps}>
        <span class="iconify size-4 shrink-0 octicon--gear-16" aria-hidden="true"></span>
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content aria-label="Options" class="z-50 mx-2 flex flex-col gap-1 rounded-sm border bg-neutral py-1 text-sm shadow">
            {@render children?.()}
            <Popover.Arrow class="text-edge" />
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>

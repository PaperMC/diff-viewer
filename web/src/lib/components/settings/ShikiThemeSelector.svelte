<script lang="ts">
    import { type BundledTheme, bundledThemes } from "shiki";
    import { Label, Select, useId } from "bits-ui";
    import { capitalizeFirstLetter, resizeObserver } from "$lib/util";

    interface Props {
        value: BundledTheme;
        mode: "light" | "dark";
    }

    let { value = $bindable<BundledTheme>(), mode }: Props = $props();

    let anchor: HTMLElement | null = $state(null);
    let triggerLabelContainerW: number = $state(0);
    let triggerLabelW: number = $state(0);
    let scrollDistance: number = $derived(triggerLabelW - triggerLabelContainerW);
    let labelId = useId();
    let triggerId = useId();
</script>

<Select.Root type="single" scrollAlignment="center" bind:value>
    <Select.Trigger
        aria-labelledby={labelId}
        id={triggerId}
        class="group flex cursor-pointer items-center justify-between gap-1 px-2 py-1 ring-focus focus:outline-none focus-visible:ring-2"
    >
        <Label.Root id={labelId} for={triggerId} class="cursor-pointer">{capitalizeFirstLetter(mode)} theme</Label.Root>
        <div
            class="flex w-44 items-center gap-1 rounded-sm border btn-ghost bg-neutral px-2 py-0.5 text-sm select-none group-hover:btn-ghost-hover group-active:btn-ghost-active"
            bind:this={anchor}
        >
            <div bind:clientWidth={triggerLabelContainerW} class="flex grow overflow-hidden" class:reveal-right={scrollDistance !== 0}>
                <div
                    aria-label="Current {mode} syntax highlighting theme"
                    class="scrolling-text grow text-left text-nowrap"
                    style="--scroll-distance: -{scrollDistance}px;"
                    {@attach resizeObserver((e) => (triggerLabelW = e[0].target.scrollWidth))}
                >
                    {value}
                </div>
            </div>
            <span aria-hidden="true" class="iconify size-4 shrink-0 text-base text-em-med octicon--triangle-down-16"></span>
        </div>
    </Select.Trigger>
    <Select.Portal>
        <Select.Content class="z-100 mt-0.5 flex max-h-64 flex-col gap-1 overflow-y-auto rounded-sm border bg-neutral p-1.5 shadow-md" customAnchor={anchor}>
            {#each Object.keys(bundledThemes) as theme (theme)}
                <Select.Item
                    value={theme}
                    class="cursor-default rounded-sm px-2 py-1 text-sm data-highlighted:bg-neutral-3 data-selected:bg-blue-500 data-selected:text-white"
                >
                    {theme}
                </Select.Item>
            {/each}
        </Select.Content>
    </Select.Portal>
</Select.Root>

<style>
    .reveal-right {
        mask-image: linear-gradient(to right, var(--color-neutral) 0%, var(--color-neutral) 90%, transparent 100%);
    }
    .reveal-right:hover {
        mask-image: initial;
    }

    .scrolling-text:hover {
        animation: scrollText 5s ease-in-out infinite;
    }

    @keyframes scrollText {
        0% {
            transform: translateX(0);
        }
        50% {
            transform: translateX(var(--scroll-distance));
        }
        100% {
            transform: translateX(0);
        }
    }
</style>

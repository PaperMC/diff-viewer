<script lang="ts">
    import { MultiFileDiffViewerState } from "$lib/diff-viewer.svelte";
    import { Button, mergeProps } from "bits-ui";
    import { type RestProps } from "$lib/types";
    import { GlobalOptions } from "$lib/global-options.svelte";

    let { ...restProps }: RestProps = $props();

    const viewer = MultiFileDiffViewerState.get();
    const globalOptions = GlobalOptions.get();

    let mergedProps = $derived(
        mergeProps(
            {
                title: viewer.layoutState.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar",
                class: "flex size-6 items-center justify-center btn-ghost rounded-sm",
            },
            restProps,
        ),
    );
</script>

<Button.Root type="button" data-side={globalOptions.sidebarLocation} onclick={() => viewer.layoutState.toggleSidebar()} data-sidebar-toggle {...mergedProps}>
    <span
        class="iconify size-4 shrink-0 text-em-med octicon--sidebar-collapse-16 data-[collapsed=false]:octicon--sidebar-expand-16 data-[side=right]:scale-x-[-1]"
        aria-hidden="true"
        data-collapsed={viewer.layoutState.sidebarCollapsed}
        data-side={globalOptions.sidebarLocation}
    ></span>
</Button.Root>

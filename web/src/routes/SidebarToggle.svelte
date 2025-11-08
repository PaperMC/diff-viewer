<script lang="ts">
    import { MultiFileDiffViewerState } from "$lib/diff-viewer-multi-file.svelte";
    import { Button, mergeProps } from "bits-ui";
    import { type RestProps } from "$lib/types";
    import { GlobalOptions } from "$lib/global-options.svelte";

    let { ...restProps }: RestProps = $props();

    const viewer = MultiFileDiffViewerState.get();
    const globalOptions = GlobalOptions.get();

    let mergedProps = $derived(
        mergeProps(
            {
                class: "flex size-6 items-center justify-center rounded-md btn-ghost text-primary",
            },
            restProps,
        ),
    );
</script>

<Button.Root
    title={viewer.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
    type="button"
    data-side={globalOptions.sidebarLocation}
    onclick={() => (viewer.sidebarCollapsed = !viewer.sidebarCollapsed)}
    data-sidebar-toggle
    {...mergedProps}
>
    <span
        class="iconify size-4 shrink-0 octicon--sidebar-collapse-16 data-[collapsed=false]:octicon--sidebar-expand-16 data-[side=right]:scale-x-[-1]"
        aria-hidden="true"
        data-collapsed={viewer.sidebarCollapsed}
        data-side={globalOptions.sidebarLocation}
    ></span>
</Button.Root>

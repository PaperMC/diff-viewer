<script lang="ts">
    import { VList } from "virtua/svelte";
    import { MultiFileDiffViewerState } from "$lib/diff-viewer.svelte";
    import DiffStats from "$lib/components/diff/DiffStats.svelte";
    import DiffSearch from "./DiffSearch.svelte";
    import FileHeader from "./FileHeader.svelte";
    import DiffTitle from "./DiffTitle.svelte";
    import OpenDiffDialog from "./OpenDiffDialog.svelte";
    import type { PageProps } from "./$types";
    import ProgressBar from "$lib/components/progress-bar/ProgressBar.svelte";
    import { GlobalOptions } from "$lib/global-options.svelte";
    import MenuBar from "$lib/components/menu-bar/MenuBar.svelte";
    import SettingsDialog from "$lib/components/settings/SettingsDialog.svelte";
    import Sidebar from "$lib/components/sidebar/Sidebar.svelte";
    import DiffWrapper from "./DiffWrapper.svelte";
    import { PaneGroup, Pane, PaneResizer } from "paneforge";
    import DiffFilterDialog from "$lib/components/diff-filtering/DiffFilterDialog.svelte";

    let { data }: PageProps = $props();
    const globalOptions = GlobalOptions.get();
    const viewer = MultiFileDiffViewerState.init(data.rootLayout);

    function getPageTitle() {
        if (viewer.diffMetadata) {
            const meta = viewer.diffMetadata;
            if (meta.type === "github") {
                return `${meta.details.description} - GitHub/${meta.details.owner}/${meta.details.repo} - diffs.dev`;
            } else if (meta.type === "file") {
                return `${meta.fileName} - diffs.dev`;
            }
        }
        return "diffs.dev Diff Viewer";
    }

    let pageTitle = $derived(getPageTitle());
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta
        name="description"
        content="Featureful and performant multi-file diff viewer. Compare files, directories, and images. View GitHub PRs, commits, and comparisons without lag, even for large diffs."
    />
</svelte:head>

<svelte:window bind:innerWidth={viewer.layoutState.windowInnerWidth} />

{#if viewer.loadingState.loading}
    <div class="absolute bottom-1/2 left-1/2 z-50 -translate-x-1/2 translate-y-1/2 rounded-full border bg-neutral p-2 shadow-md">
        <ProgressBar bind:state={viewer.loadingState.progressBar} class="h-2 w-32" />
    </div>
{/if}

<OpenDiffDialog bind:open={viewer.openDiffDialogOpen} />
<SettingsDialog bind:open={viewer.settingsDialogOpen} />
<DiffFilterDialog title="Edit Filters" bind:open={viewer.diffFilterDialogOpen} instance={viewer.filter} />

{#snippet sidebarPane(order: number)}
    {#if !viewer.layoutState.sidebarCollapsed}
        <Pane
            bind:this={viewer.layoutState.sidebarPane}
            defaultSize={viewer.layoutState.defaultSidebarWidth}
            minSize={viewer.layoutState.minSidebarWidth}
            onResize={(size, prevSize) => {
                viewer.layoutState.onSidebarResize(size, prevSize);
            }}
            {order}
        >
            <div class="h-full overflow-x-auto">
                <Sidebar />
            </div>
        </Pane>
    {/if}
{/snippet}

{#snippet main()}
    <div class="flex h-full max-w-screen min-w-screen flex-col md:min-w-72">
        {#if viewer.diffMetadata !== null}
            <div class="flex flex-wrap gap-2 px-3 pt-2">
                <DiffTitle meta={viewer.diffMetadata} />
            </div>
        {/if}
        <div class="flex flex-row items-center gap-2 px-3 py-2">
            <DiffStats add={viewer.statsSummary.addedLines} remove={viewer.statsSummary.removedLines} />
            <DiffSearch />
        </div>
        <div class="flex flex-1 grow flex-col border-t">
            <VList data={viewer.filteredFileDetails.array} style="height: 100%;" getKey={(value) => value.index} bind:this={viewer.vlist}>
                {#snippet children(value)}
                    <div id={`file-${value.index}`}>
                        <FileHeader {value} />
                        <DiffWrapper {value} />
                    </div>
                {/snippet}
            </VList>
        </div>
    </div>
{/snippet}

{#snippet mainPane(order: number)}
    <Pane defaultSize={viewer.layoutState.defaultMainWidth} {order}>
        {@render main()}
    </Pane>
{/snippet}

<div class="flex min-h-screen flex-col">
    <MenuBar />
    <div class="relative flex max-w-full grow flex-col justify-center">
        <PaneGroup direction="horizontal" class="grow">
            {#if globalOptions.sidebarLocation === "left"}
                {@render sidebarPane(1)}
            {:else}
                {@render mainPane(1)}
            {/if}
            {#if !viewer.layoutState.sidebarCollapsed}
                <PaneResizer>
                    <div
                        class="relative h-full w-px bg-edge after:absolute after:inset-y-0 after:left-1/2 after:z-10 after:h-full after:w-1 after:-translate-x-1/2 hover:after:bg-edge/80"
                    ></div>
                </PaneResizer>
            {/if}
            {#if globalOptions.sidebarLocation === "right"}
                {@render sidebarPane(2)}
            {:else}
                {@render mainPane(2)}
            {/if}
        </PaneGroup>
    </div>
</div>

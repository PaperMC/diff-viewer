<script lang="ts">
    import { VList } from "virtua/svelte";
    import { MultiFileDiffViewerState } from "$lib/diff-viewer.svelte";
    import DiffStats from "$lib/components/diff/DiffStats.svelte";
    import DiffSearch from "./DiffSearch.svelte";
    import FileHeader from "./FileHeader.svelte";
    import DiffTitle from "./DiffTitle.svelte";
    import OpenDiffDialog from "./OpenDiffDialog.svelte";
    import SidebarToggle from "./SidebarToggle.svelte";
    import type { PageProps } from "./$types";
    import ProgressBar from "$lib/components/progress-bar/ProgressBar.svelte";
    import { GlobalOptions } from "$lib/global-options.svelte";
    import MenuBar from "$lib/components/menu-bar/MenuBar.svelte";
    import SettingsDialog from "$lib/components/settings/SettingsDialog.svelte";
    import Sidebar from "./Sidebar.svelte";
    import DiffWrapper from "./DiffWrapper.svelte";

    let { data }: PageProps = $props();
    GlobalOptions.init(data.globalOptions);
    const viewer = MultiFileDiffViewerState.init();

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

    let mainContainerRef: HTMLDivElement | null = $state(null);
</script>

<svelte:head>
    <title>{pageTitle}</title>
    <meta
        name="description"
        content="Featureful and performant multi-file diff viewer. Compare files, directories, and images. View GitHub PRs, commits, and comparisons without lag, even for large diffs."
    />
</svelte:head>

{#if viewer.loadingState.loading}
    <div class="absolute bottom-1/2 left-1/2 z-50 -translate-x-1/2 translate-y-1/2 rounded-full border bg-neutral p-2 shadow-md">
        <ProgressBar bind:state={viewer.loadingState.progressBar} class="h-2 w-32" />
    </div>
{/if}

<OpenDiffDialog bind:open={viewer.openDiffDialogOpen} />
<SettingsDialog bind:open={viewer.settingsDialogOpen} />

<div class="flex min-h-screen flex-col">
    <MenuBar />
    <div bind:this={mainContainerRef} class="relative flex max-w-full grow flex-row justify-center">
        <Sidebar closeOnClick={mainContainerRef} />
        <div class="flex max-w-full grow flex-col">
            {#if viewer.diffMetadata !== null}
                <div class="flex flex-wrap gap-2 px-3 pt-2">
                    <DiffTitle meta={viewer.diffMetadata} />
                </div>
            {/if}
            <div class="flex flex-row items-center gap-2 px-3 py-2">
                <SidebarToggle class="data-[side=right]:order-10" />
                <DiffStats add={viewer.stats.addedLines} remove={viewer.stats.removedLines} />
                <DiffSearch />
            </div>
            <div class="flex flex-1 flex-col border-t">
                <VList data={viewer.fileDetails} style="height: 100%;" getKey={(_, i) => i} bind:this={viewer.vlist}>
                    {#snippet children(value, index)}
                        <div id={`file-${index}`}>
                            <FileHeader {index} {value} />
                            <DiffWrapper {index} {value} />
                        </div>
                    {/snippet}
                </VList>
            </div>
        </div>
    </div>
</div>

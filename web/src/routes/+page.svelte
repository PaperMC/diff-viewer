<script lang="ts">
    import ConciseDiffView from "$lib/components/diff/ConciseDiffView.svelte";
    import { VList } from "virtua/svelte";
    import { MultiFileDiffViewerState, requireEitherImage } from "$lib/diff-viewer.svelte";
    import Spinner from "$lib/components/Spinner.svelte";
    import ImageDiff from "$lib/components/diff/ImageDiff.svelte";
    import AddedOrRemovedImage from "$lib/components/diff/AddedOrRemovedImage.svelte";
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

    let { data }: PageProps = $props();
    const globalOptions = GlobalOptions.init(data.globalOptions);
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
                            {#if !viewer.fileStates[index].collapsed && value.type === "image"}
                                {@const image = value.image}
                                <div class="mb border-b text-sm">
                                    {#if image.load}
                                        {#if image.fileA !== null && image.fileB !== null}
                                            {#await Promise.all([image.fileA.getValue(), image.fileB.getValue()])}
                                                <div class="flex items-center justify-center bg-neutral-2 p-4"><Spinner /></div>
                                            {:then images}
                                                <ImageDiff fileA={images[0]} fileB={images[1]} />
                                            {/await}
                                        {:else}
                                            {#await requireEitherImage(image).getValue()}
                                                <div class="flex items-center justify-center bg-neutral-2 p-4"><Spinner /></div>
                                            {:then file}
                                                <AddedOrRemovedImage {file} mode={image.fileA === null ? "add" : "remove"} />
                                            {/await}
                                        {/if}
                                    {:else}
                                        <div class="flex justify-center bg-neutral-2 p-4">
                                            <button
                                                type="button"
                                                class=" flex flex-row items-center justify-center gap-1 rounded-md btn-primary px-2 py-1"
                                                onclick={() => (image.load = true)}
                                            >
                                                <span class="iconify size-4 shrink-0 octicon--image-16"></span><span>Load image diff</span>
                                            </button>
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                            {#if !viewer.fileStates[index].collapsed && value.type === "text" && (!value.patchHeaderDiffOnly || !globalOptions.omitPatchHeaderOnlyHunks)}
                                <div class="border-b">
                                    <ConciseDiffView
                                        patch={value.structuredPatch}
                                        syntaxHighlighting={globalOptions.syntaxHighlighting}
                                        syntaxHighlightingTheme={globalOptions.syntaxHighlightingTheme}
                                        omitPatchHeaderOnlyHunks={globalOptions.omitPatchHeaderOnlyHunks}
                                        wordDiffs={globalOptions.wordDiffs}
                                        lineWrap={globalOptions.lineWrap}
                                        searchQuery={viewer.searchQueryDebounced.current}
                                        searchMatchingLines={() => viewer.searchResults.then((r) => r.lines.get(value))}
                                        activeSearchResult={viewer.activeSearchResult && viewer.activeSearchResult.file === value
                                            ? viewer.activeSearchResult.idx
                                            : undefined}
                                        cache={viewer.diffViewCache}
                                        cacheKey={value}
                                    />
                                </div>
                            {/if}
                        </div>
                    {/snippet}
                </VList>
            </div>
        </div>
    </div>
</div>

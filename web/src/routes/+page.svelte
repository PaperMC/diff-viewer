<script lang="ts">
    import ConciseDiffView from "$lib/components/diff/ConciseDiffView.svelte";
    import { type FileTreeNodeData } from "$lib/util";
    import { VList } from "virtua/svelte";
    import { type FileDetails, getFileStatusProps, MultiFileDiffViewerState, requireEitherImage, staticSidebar } from "$lib/diff-viewer.svelte";
    import Tree from "$lib/components/tree/Tree.svelte";
    import Spinner from "$lib/components/Spinner.svelte";
    import { type TreeNode } from "$lib/components/tree/index.svelte";
    import ImageDiff from "$lib/components/diff/ImageDiff.svelte";
    import AddedOrRemovedImage from "$lib/components/diff/AddedOrRemovedImage.svelte";
    import DiffStats from "$lib/components/diff/DiffStats.svelte";
    import DiffSearch from "./DiffSearch.svelte";
    import FileHeader from "./FileHeader.svelte";
    import DiffTitle from "./DiffTitle.svelte";
    import { type Action } from "svelte/action";
    import { on } from "svelte/events";
    import OpenDiffDialog from "./OpenDiffDialog.svelte";
    import { onClickOutside } from "runed";
    import SidebarToggle from "./SidebarToggle.svelte";
    import type { PageProps } from "./$types";
    import ProgressBar from "$lib/components/progress-bar/ProgressBar.svelte";
    import { GlobalOptions } from "$lib/global-options.svelte";
    import MenuBar from "$lib/components/menu-bar/MenuBar.svelte";
    import SettingsDialog from "$lib/components/settings/SettingsDialog.svelte";

    let { data }: PageProps = $props();
    const globalOptions = GlobalOptions.init(data.globalOptions);
    const viewer = MultiFileDiffViewerState.init();
    let sidebarElement: HTMLDivElement | undefined = $state();

    onClickOutside(
        () => sidebarElement,
        (e) => {
            if (e.target instanceof HTMLElement && e.target.closest("[data-sidebar-toggle]")) {
                // Ignore toggle button clicks
                return;
            }
            if (!staticSidebar.current) {
                viewer.sidebarCollapsed = true;
            }
        },
    );

    function filterFileNode(file: TreeNode<FileTreeNodeData>): boolean {
        return file.data.type === "file" && viewer.filterFile(file.data.data as FileDetails);
    }

    function scrollToFileClick(event: Event, index: number) {
        const element: HTMLElement = event.target as HTMLElement;
        // Don't scroll if we clicked the inner checkbox
        if (element.tagName.toLowerCase() !== "input") {
            viewer.scrollToFile(index);
        }
    }

    const focusFileDoubleClick: Action<HTMLDivElement, { index: number }> = (div, { index }) => {
        const destroyDblclick = on(div, "dblclick", (event) => {
            const element: HTMLElement = event.target as HTMLElement;
            if (element.tagName.toLowerCase() !== "input") {
                viewer.scrollToFile(index, { focus: true });
                if (!staticSidebar.current) {
                    viewer.sidebarCollapsed = true;
                }
            }
        });
        const destoryMousedown = on(div, "mousedown", (event) => {
            const element: HTMLElement = event.target as HTMLElement;
            if (element.tagName.toLowerCase() !== "input" && event.detail === 2) {
                // Don't select text on double click
                event.preventDefault();
            }
        });
        return {
            destroy() {
                destroyDblclick();
                destoryMousedown();
            },
        };
    };

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

{#if viewer.loadingState.loading}
    <div class="absolute bottom-1/2 left-1/2 z-50 -translate-x-1/2 translate-y-1/2 rounded-full border bg-neutral p-2 shadow-md">
        <ProgressBar bind:state={viewer.loadingState.progressBar} class="h-2 w-32" />
    </div>
{/if}

<OpenDiffDialog bind:open={viewer.openDiffDialogOpen} />
<SettingsDialog bind:open={viewer.settingsDialogOpen} />

<div class="flex min-h-screen flex-col">
    <MenuBar />
    <div class="relative flex grow flex-row justify-center">
        <div
            bind:this={sidebarElement}
            class="absolute top-0 z-10 flex h-full w-full flex-col bg-neutral
                data-[collapsed=true]:hidden
                data-[side=left]:left-0 data-[side=left]:border-e data-[side=right]:right-0 data-[side=right]:order-10 data-[side=right]:border-s
                md:w-[350px] md:shadow-md lg:static
                lg:h-auto lg:shadow-none"
            data-side={globalOptions.sidebarLocation}
            data-collapsed={viewer.sidebarCollapsed}
        >
            <div class="m-2 flex flex-row items-center gap-2">
                <div class="relative grow">
                    <input
                        type="text"
                        placeholder="Filter file tree..."
                        bind:value={viewer.fileTreeFilter}
                        class="w-full rounded-md border px-8 py-1 overflow-ellipsis focus:ring-2 focus:ring-primary focus:outline-none"
                        autocomplete="off"
                    />
                    <span aria-hidden="true" class="absolute top-1/2 left-2 iconify size-4 -translate-y-1/2 text-em-med octicon--filter-16"></span>
                    {#if viewer.fileTreeFilterDebounced.current}
                        <button
                            class="absolute top-1/2 right-2 iconify size-4 -translate-y-1/2 text-gray-500 octicon--x-16 hover:text-gray-700"
                            onclick={() => viewer.clearSearch()}
                            aria-label="clear filter"
                        ></button>
                    {/if}
                </div>
                <SidebarToggle class="lg:hidden" />
            </div>
            {#if viewer.filteredFileDetails.length !== viewer.fileDetails.length}
                <div class="ms-2 mb-2 text-sm text-gray-600">
                    Showing {viewer.filteredFileDetails.length} of {viewer.fileDetails.length} files
                </div>
            {/if}
            <div class="flex h-full flex-col overflow-y-auto border-t">
                <div class="h-100">
                    {#snippet fileSnippet(value: FileDetails)}
                        <div
                            class="flex cursor-pointer items-center justify-between btn-ghost px-2 py-1 text-sm focus:ring-2 focus:ring-primary focus:outline-none focus:ring-inset"
                            onclick={(e) => scrollToFileClick(e, value.index)}
                            use:focusFileDoubleClick={{ index: value.index }}
                            onkeydown={(e) => e.key === "Enter" && viewer.scrollToFile(value.index)}
                            role="button"
                            tabindex="0"
                            id={"file-tree-file-" + value.index}
                        >
                            <span
                                class="{getFileStatusProps(value.status).iconClasses} me-1 flex size-4 shrink-0 items-center justify-center"
                                aria-label={getFileStatusProps(value.status).title}
                            ></span>
                            <span class="grow overflow-hidden break-all">{value.toFile.substring(value.toFile.lastIndexOf("/") + 1)}</span>
                            <input
                                type="checkbox"
                                class="ms-1 size-4 shrink-0 rounded-sm border"
                                autocomplete="off"
                                aria-label="File viewed"
                                onchange={() => viewer.toggleChecked(value.index)}
                                checked={viewer.fileStates[value.index].checked}
                            />
                        </div>
                    {/snippet}
                    <Tree roots={viewer.fileTreeRoots} filter={filterFileNode} bind:instance={viewer.tree}>
                        {#snippet nodeRenderer({ node, collapsed, toggleCollapse })}
                            {@const folderIcon = collapsed ? "octicon--file-directory-fill-16" : "octicon--file-directory-open-fill-16"}
                            {#if node.data.type === "file"}
                                {@render fileSnippet(node.data.data as FileDetails)}
                            {:else}
                                <div
                                    class="flex cursor-pointer items-center justify-between btn-ghost px-2 py-1 text-sm focus:ring-2 focus:ring-primary focus:outline-none focus:ring-inset"
                                    onclick={toggleCollapse}
                                    onkeydown={(e) => e.key === "Enter" && toggleCollapse()}
                                    role="button"
                                    tabindex="0"
                                >
                                    <span class="me-1 iconify size-4 shrink-0 text-primary {folderIcon}"></span>
                                    <span class="grow overflow-hidden break-all">{node.data.data}</span>
                                    {#if collapsed}
                                        <span class="iconify size-4 shrink-0 text-primary octicon--chevron-right-16"></span>
                                    {:else}
                                        <span class="iconify size-4 shrink-0 text-primary octicon--chevron-down-16"></span>
                                    {/if}
                                </div>
                            {/if}
                        {/snippet}
                        {#snippet childWrapper({ node, collapsed, children })}
                            <div
                                class={{
                                    hidden: collapsed || node.visibleChildren.length <= 0,
                                    "dir-header": node.data.type === "directory" && !collapsed,
                                    "ps-4": true,
                                }}
                            >
                                {@render children({ node })}
                            </div>
                        {/snippet}
                    </Tree>
                </div>
            </div>
        </div>
        <div class="flex grow flex-col">
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
                                <div class="mb border-b">
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

<style>
    .dir-header {
        position: relative;
    }
    .dir-header::before {
        content: "";
        position: absolute;
        height: 100%;
        width: 1px;
        top: 0;
        left: 1rem;
        background-color: var(--color-gray-500);
        z-index: 50;
        display: block;
    }
</style>

<script lang="ts">
    import { type FileTreeNodeData } from "$lib/util";
    import { type FileDetails, getFileStatusProps, MultiFileDiffViewerState, staticSidebar } from "$lib/diff-viewer.svelte";
    import Tree from "$lib/components/tree/Tree.svelte";
    import { type TreeNode } from "$lib/components/tree/index.svelte";
    import { type Action } from "svelte/action";
    import { on } from "svelte/events";

    const viewer = MultiFileDiffViewerState.get();

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
                    viewer.layoutState.sidebarCollapsed = true;
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
</script>

<div class="flex h-full max-w-full min-w-[200px] flex-col bg-neutral">
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
        display: block;
    }
</style>

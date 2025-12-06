<script lang="ts">
    import { type FileTreeNodeData } from "$lib/util";
    import { type FileDetails, getFileStatusProps, MultiFileDiffViewerState, staticSidebar } from "$lib/diff-viewer.svelte";
    import Tree from "$lib/components/tree/Tree.svelte";
    import { type TreeNode } from "$lib/components/tree/index.svelte";
    import { on } from "svelte/events";
    import { createAttachmentKey, type Attachment } from "svelte/attachments";
    import { boolAttr } from "runed";

    const viewer = MultiFileDiffViewerState.get();

    function filterFileNode(file: TreeNode<FileTreeNodeData>): boolean {
        return file.data.type === "file" && viewer.filterFile(file.data.file);
    }

    function shouldScrollToFile(nodeInteractionEvent: Event): boolean {
        const element: HTMLElement = nodeInteractionEvent.target as HTMLElement;
        // Don't scroll/etc. if we clicked the inner checkbox
        return element.tagName.toLowerCase() !== "input";
    }

    function focusFileDoubleClick(value: FileDetails): Attachment<HTMLElement> {
        return (div) => {
            const destroyDblclick = on(div, "dblclick", (event) => {
                if (!shouldScrollToFile(event)) return;
                viewer.scrollToFile(value.index, { focus: true });
                viewer.setSelection(value, undefined);
                if (!staticSidebar.current) {
                    viewer.layoutState.sidebarCollapsed = true;
                }
            });
            const destroyMousedown = on(div, "mousedown", (event) => {
                if (!shouldScrollToFile(event)) return;
                if (event.detail === 2) {
                    // Don't select text on double click
                    event.preventDefault();
                }
            });
            return () => {
                destroyDblclick();
                destroyMousedown();
            };
        };
    }

    function nodeProps(data: FileTreeNodeData, collapsed: boolean, toggleCollapse: () => void) {
        if (data.type === "file") {
            const file = data.file;
            return {
                id: `file-tree-file-${file.index}`,
                "data-selected": boolAttr(viewer.selection?.file.index === file.index),
                onclick: (e: MouseEvent) => shouldScrollToFile(e) && viewer.scrollToFile(file.index),
                onkeydown: (e: KeyboardEvent) => e.key === "Enter" && shouldScrollToFile(e) && viewer.scrollToFile(file.index),
                [createAttachmentKey()]: focusFileDoubleClick(file),
            };
        } else if (data.type === "directory") {
            return {
                onclick: toggleCollapse,
                onkeydown: (e: KeyboardEvent) => e.key === "Enter" && toggleCollapse(),
                "aria-expanded": !collapsed,
            };
        }
        return {};
    }
</script>

{#snippet renderFileNode(value: FileDetails)}
    <div class="file flex cursor-pointer items-center justify-between px-2 py-1 text-sm">
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

{#snippet renderFolderNode(name: string, collapsed: boolean)}
    {@const folderIcon = collapsed ? "octicon--file-directory-fill-16" : "octicon--file-directory-open-fill-16"}
    <div class="flex cursor-pointer items-center justify-between px-2 py-1 text-sm">
        <span class="me-1 iconify size-4 shrink-0 text-em-med {folderIcon}"></span>
        <span class="grow overflow-hidden break-all">{name}</span>
        {#if collapsed}
            <span class="iconify size-4 shrink-0 text-em-med octicon--chevron-right-16"></span>
        {:else}
            <span class="iconify size-4 shrink-0 text-em-med octicon--chevron-down-16"></span>
        {/if}
    </div>
{/snippet}

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
            <Tree roots={viewer.fileTreeRoots} filter={filterFileNode} bind:instance={viewer.tree}>
                {#snippet nodeRenderer({ node, collapsed, toggleCollapse })}
                    <div
                        role="button"
                        tabindex="0"
                        class="btn-ghost focus:ring-2 focus:ring-primary/50 focus:outline-none focus:ring-inset"
                        style="padding-left: {node.depth}rem;"
                        {...nodeProps(node.data, collapsed, toggleCollapse)}
                    >
                        {#if node.data.type === "file"}
                            {@render renderFileNode(node.data.file)}
                        {:else}
                            {@render renderFolderNode(node.data.name, collapsed)}
                        {/if}
                    </div>
                {/snippet}
                {#snippet childWrapper({ node, collapsed, children })}
                    {#if node.visibleChildren.length > 0}
                        <div class="collapsible dir-header" data-collapsed={boolAttr(collapsed)} data-type={node.data.type} style="--tree-depth: {node.depth};">
                            {@render children({ node })}
                        </div>
                    {/if}
                {/snippet}
            </Tree>
        </div>
    </div>
</div>

<style>
    .collapsible[data-collapsed] {
        display: none;
    }
    .dir-header {
        position: relative;
    }
    .dir-header::before {
        content: "";
        position: absolute;
        height: 100%;
        width: 1px;
        top: 0;
        left: calc(1rem + var(--tree-depth) * 1rem);
        background-color: var(--color-em-disabled);
        display: block;
        z-index: 1;
    }
    [data-selected] .file {
        position: relative;
        &::after {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background-color: var(--color-primary);
            z-index: 2;
        }
    }
</style>

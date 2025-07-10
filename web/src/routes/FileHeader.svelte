<script lang="ts">
    import DiffStats from "$lib/components/diff/DiffStats.svelte";
    import LabeledCheckbox from "$lib/components/LabeledCheckbox.svelte";
    import { type FileDetails, GlobalOptions, MultiFileDiffViewerState } from "$lib/diff-viewer-multi-file.svelte";
    import { Popover, Button } from "bits-ui";
    import { tick } from "svelte";

    interface Props {
        index: number;
        value: FileDetails;
    }

    const viewer = MultiFileDiffViewerState.get();
    const globalOptions = GlobalOptions.get();
    let { index, value }: Props = $props();

    let popoverOpen = $state(false);

    async function showInFileTree() {
        const fileTreeElement = document.getElementById("file-tree-file-" + index);
        if (fileTreeElement) {
            popoverOpen = false;
            viewer.tree?.expandParents((node) => node.data === value);
            viewer.sidebarCollapsed = false;
            await tick();
            requestAnimationFrame(() => {
                fileTreeElement.focus();
            });
        }
    }

    let patchHeaderDiffOnly = $derived(value.type === "text" && value.patchHeaderDiffOnly);
</script>

{#snippet fileName()}
    {#if value.fromFile === value.toFile}
        <span class="max-w-full overflow-hidden break-all">{value.toFile}</span>
    {:else}
        <span class="flex max-w-full flex-wrap items-center gap-0.5 overflow-hidden break-all">
            {value.fromFile}
            <span class="iconify inline-block text-primary octicon--arrow-right-16" aria-label="renamed to"></span>
            {value.toFile}
        </span>
    {/if}
{/snippet}

{#snippet collapseToggle()}
    <button
        title={viewer.collapsed[index] ? "Expand file" : "Collapse file"}
        type="button"
        class="flex size-6 items-center justify-center rounded-md btn-ghost p-0.5 text-primary"
        onclick={(e) => {
            viewer.toggleCollapse(index);
            e.stopPropagation();
        }}
    >
        {#if viewer.collapsed[index]}
            <span aria-label="expand file" class="iconify size-4 shrink-0 text-primary octicon--chevron-right-16" aria-hidden="true"></span>
        {:else}
            <span aria-label="collapse file" class="iconify size-4 shrink-0 text-primary octicon--chevron-down-16" aria-hidden="true"></span>
        {/if}
    </button>
{/snippet}

{#snippet actionsPopover()}
    <Popover.Root bind:open={popoverOpen}>
        <Popover.Trigger
            title="Actions"
            class="flex size-6 items-center justify-center rounded-md btn-ghost p-0.5 data-[state=open]:btn-ghost-visible"
            onclick={(e) => e.stopPropagation()}
        >
            <span class="iconify size-4 bg-primary octicon--kebab-horizontal-16" aria-hidden="true"></span>
        </Popover.Trigger>
        <Popover.Portal>
            <Popover.Content class="flex flex-col overflow-hidden rounded-sm border bg-neutral text-sm shadow-sm select-none">
                <Button.Root onclick={showInFileTree} class="btn-ghost px-2 py-1">Show in file tree</Button.Root>
                <LabeledCheckbox
                    labelText="File viewed"
                    bind:checked={
                        () => viewer.checked[index] ?? false,
                        () => {
                            viewer.toggleChecked(index);
                            popoverOpen = false;
                        }
                    }
                />
                <Popover.Arrow class="text-edge" />
            </Popover.Content>
        </Popover.Portal>
    </Popover.Root>
{/snippet}

<div
    id="file-header-{index}"
    class="sticky top-0 z-10 flex flex-row items-center gap-2 border-b bg-neutral px-2 py-1 text-sm shadow-sm focus:ring-2 focus:ring-primary focus:outline-none focus:ring-inset"
    tabindex={0}
    role="button"
    onclick={() => viewer.scrollToFile(index, { autoExpand: false, smooth: true })}
    onkeyup={(event) => event.key === "Enter" && viewer.scrollToFile(index, { autoExpand: false, smooth: true })}
>
    {#if value.type === "text"}
        <DiffStats brief add={viewer.stats.fileAddedLines[index]} remove={viewer.stats.fileRemovedLines[index]} />
    {/if}
    {@render fileName()}
    <div class="ms-0.5 ml-auto flex items-center gap-2">
        {#if patchHeaderDiffOnly}
            <span class="rounded-sm bg-neutral-3 px-1.5">Patch-header-only diff</span>
        {/if}
        {@render actionsPopover()}
        {#if !patchHeaderDiffOnly || !globalOptions.omitPatchHeaderOnlyHunks || value.type === "image"}
            {@render collapseToggle()}
        {/if}
    </div>
</div>

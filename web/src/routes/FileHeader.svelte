<script lang="ts">
    import DiffStats from "$lib/components/diff/DiffStats.svelte";
    import LabeledCheckbox from "$lib/components/LabeledCheckbox.svelte";
    import { type FileDetails, MultiFileDiffViewerState } from "$lib/diff-viewer.svelte";
    import { GlobalOptions } from "$lib/global-options.svelte";
    import { Popover, Button } from "bits-ui";
    import { boolAttr } from "runed";
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
        viewer.layoutState.sidebarCollapsed = false;
        await tick();

        const fileTreeElement = document.getElementById("file-tree-file-" + index);
        if (fileTreeElement) {
            popoverOpen = false;
            viewer.tree?.expandParents((node) => node.type === "file" && node.file === value);
            requestAnimationFrame(() => {
                fileTreeElement.focus();
            });
        }
    }

    let patchHeaderDiffOnly = $derived(value.type === "text" && value.patchHeaderDiffOnly);

    let { baseFileUrl, headFileUrl } = $derived.by(() => {
        if (viewer.diffMetadata?.type === "github") {
            const ghDetails = viewer.diffMetadata.details;
            return {
                baseFileUrl: `https://github.com/${ghDetails.owner}/${ghDetails.repo}/blob/${ghDetails.base}/${value.fromFile}`,
                headFileUrl: `https://github.com/${ghDetails.owner}/${ghDetails.repo}/blob/${ghDetails.head}/${value.toFile}`,
            };
        }
        return { baseFileUrl: undefined, headFileUrl: undefined };
    });

    function selectHeader() {
        viewer.scrollToFile(index, { autoExpand: false, smooth: true });
        viewer.setSelection(value, undefined);
    }

    let selected = $derived.by(() => {
        const sel = viewer.getSelection(value);
        return sel && sel.lines === undefined && sel.unresolvedLines === undefined;
    });
</script>

{#snippet fileName()}
    {#if value.fromFile === value.toFile}
        <span class="max-w-full overflow-hidden break-all">{value.toFile}</span>
    {:else}
        <span class="flex max-w-full flex-wrap items-center gap-0.5 overflow-hidden break-all">
            {value.fromFile}
            <span class="iconify inline-block text-em-med octicon--arrow-right-16" aria-label="renamed to"></span>
            {value.toFile}
        </span>
    {/if}
{/snippet}

{#snippet collapseToggle()}
    <button
        title={viewer.fileStates[index].collapsed ? "Expand file" : "Collapse file"}
        type="button"
        class="flex size-6 items-center justify-center rounded-sm btn-ghost p-0.5"
        onclick={(e) => {
            viewer.toggleCollapse(index);
            e.stopPropagation();
        }}
    >
        {#if viewer.fileStates[index].collapsed}
            <span aria-label="expand file" class="iconify size-4 shrink-0 text-em-med octicon--chevron-right-16" aria-hidden="true"></span>
        {:else}
            <span aria-label="collapse file" class="iconify size-4 shrink-0 text-em-med octicon--chevron-down-16" aria-hidden="true"></span>
        {/if}
    </button>
{/snippet}

{#snippet actionsPopover()}
    <Popover.Root bind:open={popoverOpen}>
        <Popover.Trigger
            title="Actions"
            class="flex size-6 items-center justify-center rounded-sm btn-ghost p-0.5 data-[state=open]:btn-ghost-visible"
            onclick={(e) => e.stopPropagation()}
        >
            <span class="iconify size-4 text-em-med octicon--kebab-horizontal-16" aria-hidden="true"></span>
        </Popover.Trigger>
        <Popover.Portal>
            <Popover.Content class="z-3 flex flex-col overflow-hidden rounded-sm border bg-neutral text-sm shadow-sm select-none">
                <Button.Root onclick={showInFileTree} class="btn-ghost px-2 py-1">Show in file tree</Button.Root>
                <LabeledCheckbox
                    labelText="File viewed"
                    bind:checked={
                        () => viewer.fileStates[index].checked,
                        () => {
                            viewer.toggleChecked(index);
                            popoverOpen = false;
                        }
                    }
                />
                {#if baseFileUrl}
                    <Button.Root href={baseFileUrl} target="_blank" rel="noopener noreferrer" class="btn-ghost px-2 py-1">View file at base</Button.Root>
                {/if}
                {#if headFileUrl}
                    <Button.Root href={headFileUrl} target="_blank" rel="noopener noreferrer" class="btn-ghost px-2 py-1">View file at head</Button.Root>
                {/if}
                <Popover.Arrow class="text-edge" />
            </Popover.Content>
        </Popover.Portal>
    </Popover.Root>
{/snippet}

<div
    id="file-header-{index}"
    class={[
        "sticky top-0 z-10 flex flex-row items-center gap-2 border-b bg-neutral px-2 py-1 text-sm shadow-sm",
        "focus-and-selected-styles focus:outline-none",
    ]}
    tabindex={0}
    role="button"
    onclick={() => selectHeader()}
    onkeyup={(event) => event.key === "Enter" && selectHeader()}
    data-selected={boolAttr(selected)}
>
    {#if value.type === "text"}
        <DiffStats brief add={viewer.stats.fileAddedLines[index]} remove={viewer.stats.fileRemovedLines[index]} />
    {/if}
    {@render fileName()}
    <div class="ms-0.5 ml-auto flex items-center gap-1">
        {#if patchHeaderDiffOnly}
            <span class="rounded-sm bg-neutral-3 px-1.5">Patch-header-only diff</span>
        {/if}
        {@render actionsPopover()}
        {#if !patchHeaderDiffOnly || !globalOptions.omitPatchHeaderOnlyHunks || value.type === "image"}
            {@render collapseToggle()}
        {/if}
    </div>
</div>

<style>
    .focus-and-selected-styles {
        &:focus {
            box-shadow:
                var(--tw-shadow),
                inset 0 0 0 2px color-mix(in srgb, var(--color-focus) 50%, transparent);
        }
        &[data-selected] {
            box-shadow:
                var(--tw-shadow),
                inset 4px 0 0 0 var(--color-focus);
        }
        &:focus[data-selected] {
            box-shadow:
                var(--tw-shadow),
                inset 0 0 0 2px color-mix(in srgb, var(--color-focus) 50%, transparent),
                inset 4px 0 0 0 var(--color-focus);
        }
    }
</style>

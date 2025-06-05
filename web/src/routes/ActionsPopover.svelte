<script lang="ts">
    import { MultiFileDiffViewerState } from "$lib/diff-viewer-multi-file.svelte";
    import { Popover, Button } from "bits-ui";

    const viewer = MultiFileDiffViewerState.get();

    let open = $state(false);
</script>

<Popover.Root bind:open>
    <Popover.Trigger title="Actions" class="flex size-6 items-center justify-center self-center rounded-md btn-ghost p-0.5 data-[state=open]:btn-ghost-visible">
        <span aria-hidden="true" class="iconify size-4 bg-primary octicon--kebab-horizontal-16"></span>
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content class="flex flex-col overflow-hidden rounded-sm border bg-neutral text-sm shadow-sm select-none">
            <Button.Root
                class="btn-ghost px-2 py-1 text-left"
                onclick={() => {
                    viewer.expandAll();
                    open = false;
                }}
            >
                Expand All
            </Button.Root>
            <Button.Root
                class="btn-ghost px-2 py-1 text-left"
                onclick={() => {
                    viewer.collapseAll();
                    open = false;
                }}
            >
                Collapse All
            </Button.Root>
            <Popover.Arrow class="text-edge" />
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>

<script lang="ts">
    import { MultiFileDiffViewerState } from "$lib/diff-viewer.svelte";
    import { Keybinds } from "$lib/keybinds.svelte";
    import { Menubar, Button } from "bits-ui";
    import SidebarToggle from "$lib/components/SidebarToggle.svelte";

    const viewer = MultiFileDiffViewerState.get();
</script>

{#snippet keybind(key: string)}
    <span class="text-em-med">{Keybinds.formatModifierBind(key)}</span>
{/snippet}

<Menubar.Root class="flex border-b leading-none">
    <Menubar.Menu>
        <Menubar.Trigger class="btn-ghost px-2 py-1 text-sm font-medium data-[state=open]:btn-ghost-hover">diffs.dev</Menubar.Trigger>
        <Menubar.Portal>
            <Menubar.Content class="z-20 border bg-neutral text-sm" align="start">
                <Menubar.Item>
                    <Button.Root
                        href="https://github.com/PaperMC/diff-viewer"
                        class="flex items-center gap-2 btn-ghost px-2 py-1"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <span class="iconify size-4 shrink-0 octicon--mark-github-16" aria-hidden="true"></span>
                        GitHub Repository
                    </Button.Root>
                </Menubar.Item>
                <Menubar.Item>
                    <Button.Root
                        href="https://chromewebstore.google.com/detail/patch-roulette/feaaoepdocmiibjilhoahgldkaajfnhb"
                        class="flex items-center gap-2 btn-ghost px-2 py-1"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <span class="iconify size-4 shrink-0 octicon--download-16" aria-hidden="true"></span>
                        Chrome Extension
                    </Button.Root>
                </Menubar.Item>
                <Menubar.Item>
                    <Button.Root
                        href="https://addons.mozilla.org/en-US/firefox/addon/patch-roulette/"
                        class="flex items-center gap-2 btn-ghost px-2 py-1"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <span class="iconify size-4 shrink-0 octicon--download-16" aria-hidden="true"></span>
                        Firefox Add-on
                    </Button.Root>
                </Menubar.Item>
                <Menubar.Separator class="h-px w-full bg-edge" />
                <Menubar.Item
                    class="flex justify-between gap-2 btn-ghost px-2 py-1 select-none"
                    onSelect={() => {
                        viewer.openDialog("settings");
                    }}
                >
                    Open Settings
                    {@render keybind(",")}
                </Menubar.Item>
            </Menubar.Content>
        </Menubar.Portal>
    </Menubar.Menu>
    <Menubar.Menu>
        <Menubar.Trigger class="btn-ghost px-2 py-1 text-sm data-[state=open]:btn-ghost-hover">File</Menubar.Trigger>
        <Menubar.Portal>
            <Menubar.Content class="z-20 border bg-neutral text-sm" align="start">
                <Menubar.Item
                    class="flex justify-between gap-2 btn-ghost px-2 py-1 select-none"
                    onSelect={() => {
                        viewer.openDialog("open-diff");
                    }}
                >
                    Open
                    {@render keybind("O")}
                </Menubar.Item>
            </Menubar.Content>
        </Menubar.Portal>
    </Menubar.Menu>
    <Menubar.Menu>
        <Menubar.Trigger class="btn-ghost px-2 py-1 text-sm data-[state=open]:btn-ghost-hover">View</Menubar.Trigger>
        <Menubar.Portal>
            <Menubar.Content class="z-20 border bg-neutral text-sm" align="start">
                <Menubar.Item
                    class="btn-ghost px-2 py-1 select-none data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:text-em-disabled"
                    disabled={viewer.diffMetadata === null}
                    onSelect={() => {
                        viewer.openDialog("diff-filter");
                    }}
                >
                    Edit Filters
                </Menubar.Item>
                <Menubar.Item
                    class="btn-ghost px-2 py-1 select-none"
                    onSelect={() => {
                        viewer.expandAll();
                    }}
                >
                    Expand All
                </Menubar.Item>
                <Menubar.Item
                    class="btn-ghost px-2 py-1 select-none"
                    onSelect={() => {
                        viewer.collapseAll();
                    }}
                >
                    Collapse All
                </Menubar.Item>
                <Menubar.Item
                    class="flex justify-between gap-2 btn-ghost px-2 py-1 select-none"
                    onSelect={() => {
                        viewer.layoutState.toggleSidebar();
                    }}
                >
                    Toggle Sidebar
                    {@render keybind("B")}
                </Menubar.Item>
                <Menubar.Item
                    class="btn-ghost px-2 py-1 select-none"
                    onSelect={() => {
                        viewer.layoutState.resetLayout();
                    }}
                >
                    Reset Layout
                </Menubar.Item>
            </Menubar.Content>
        </Menubar.Portal>
    </Menubar.Menu>
    <Menubar.Menu>
        <Menubar.Trigger class="btn-ghost px-2 py-1 text-sm data-[state=open]:btn-ghost-hover">Go</Menubar.Trigger>
        <Menubar.Portal>
            <Menubar.Content class="z-20 border bg-neutral text-sm" align="start">
                <Menubar.Item
                    class="btn-ghost px-2 py-1 select-none data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:text-em-disabled"
                    disabled={viewer.selection === undefined}
                    onSelect={() => {
                        if (viewer.selection) {
                            viewer.scrollToFile(viewer.selection.file.index, {
                                focus: !viewer.selection.lines,
                            });
                            if (viewer.selection.lines) {
                                viewer.fileStates[viewer.selection.file.index].collapsed = false;
                                viewer.jumpToSelection = true;
                            }
                        }
                    }}
                >
                    Jump to Selection
                </Menubar.Item>
            </Menubar.Content>
        </Menubar.Portal>
    </Menubar.Menu>
    <SidebarToggle class="my-auto mr-2 ml-auto" />
</Menubar.Root>

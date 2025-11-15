<script lang="ts">
    import { MultiFileDiffViewerState } from "$lib/diff-viewer.svelte";
    import { Menubar, Button } from "bits-ui";

    const viewer = MultiFileDiffViewerState.get();
</script>

<Menubar.Root class="flex border-b leading-none">
    <Menubar.Menu>
        <Menubar.Trigger class="btn-ghost px-2 py-1 text-sm font-medium data-[state=open]:btn-ghost-hover">diffs.dev</Menubar.Trigger>
        <Menubar.Portal>
            <Menubar.Content class="border bg-neutral text-sm" align="start">
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
                    class="btn-ghost px-2 py-1"
                    onSelect={() => {
                        viewer.settingsDialogOpen = true;
                    }}
                >
                    Open Settings
                </Menubar.Item>
            </Menubar.Content>
        </Menubar.Portal>
    </Menubar.Menu>
    <Menubar.Menu>
        <Menubar.Trigger class="btn-ghost px-2 py-1 text-sm data-[state=open]:btn-ghost-hover">File</Menubar.Trigger>
        <Menubar.Portal>
            <Menubar.Content class="border bg-neutral text-sm" align="start">
                <Menubar.Item
                    class="btn-ghost px-2 py-1"
                    onSelect={() => {
                        viewer.openDiffDialogOpen = true;
                    }}
                >
                    Open
                </Menubar.Item>
            </Menubar.Content>
        </Menubar.Portal>
    </Menubar.Menu>
    <Menubar.Menu>
        <Menubar.Trigger class="btn-ghost px-2 py-1 text-sm data-[state=open]:btn-ghost-hover">View</Menubar.Trigger>
        <Menubar.Portal>
            <Menubar.Content class="border bg-neutral text-sm" align="start">
                <Menubar.Item
                    class="btn-ghost px-2 py-1"
                    onSelect={() => {
                        viewer.expandAll();
                    }}
                >
                    Expand All
                </Menubar.Item>
                <Menubar.Item
                    class="btn-ghost px-2 py-1"
                    onSelect={() => {
                        viewer.collapseAll();
                    }}
                >
                    Collapse All
                </Menubar.Item>
            </Menubar.Content>
        </Menubar.Portal>
    </Menubar.Menu>
</Menubar.Root>

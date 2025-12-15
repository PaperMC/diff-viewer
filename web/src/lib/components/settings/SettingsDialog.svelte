<script module>
    export { globalThemeSetting, sectionHeader };
</script>

<script lang="ts">
    import SettingsGroup from "./SettingsGroup.svelte";
    import { Label, Dialog } from "bits-ui";
    import SimpleRadioGroup from "$lib/components/settings/SimpleRadioGroup.svelte";
    import { GlobalOptions } from "$lib/global-options.svelte";
    import { getGlobalTheme, setGlobalTheme } from "$lib/theme.svelte";
    import LabeledCheckbox from "../LabeledCheckbox.svelte";

    import ShikiThemeSelector from "./ShikiThemeSelector.svelte";
    interface Props {
        open?: boolean;
    }

    let { open = $bindable(false) }: Props = $props();

    const globalOptions = GlobalOptions.get();
</script>

{#snippet sectionHeader(text: string)}
    <div class="mt-4 font-semibold">{text}</div>
{/snippet}

{#snippet globalThemeSetting()}
    <SettingsGroup title="Theme">
        <div class="px-2 py-1">
            <SimpleRadioGroup values={["light", "dark", "auto"]} bind:value={getGlobalTheme, setGlobalTheme} aria-label="Select theme" />
        </div>
    </SettingsGroup>
{/snippet}

<Dialog.Root bind:open>
    <Dialog.Portal>
        <Dialog.Overlay
            class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <Dialog.Content
            class="fixed top-1/2 left-1/2 z-50 flex max-h-svh w-md max-w-full -translate-x-1/2 -translate-y-1/2 flex-col rounded-sm border bg-neutral shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-[95%]"
        >
            <header class="flex shrink-0 flex-row items-center justify-between rounded-t-sm border-b bg-neutral-2 p-4">
                <Dialog.Title class="text-xl font-semibold">Settings</Dialog.Title>
                <Dialog.Close title="Close dialog" class="flex size-6 items-center justify-center rounded-sm btn-ghost text-em-med">
                    <span class="iconify octicon--x-16" aria-hidden="true"></span>
                </Dialog.Close>
            </header>

            <div class="space-y-4 p-4">
                {@render globalThemeSetting()}
                <SettingsGroup title="Syntax Highlighting">
                    <LabeledCheckbox labelText="Enable" bind:checked={globalOptions.syntaxHighlighting} />
                    <ShikiThemeSelector mode="light" bind:value={globalOptions.syntaxHighlightingThemeLight} />
                    <ShikiThemeSelector mode="dark" bind:value={globalOptions.syntaxHighlightingThemeDark} />
                </SettingsGroup>
                <SettingsGroup title="Misc.">
                    <LabeledCheckbox labelText="Concise nested diffs" bind:checked={globalOptions.omitPatchHeaderOnlyHunks} />
                    <LabeledCheckbox labelText="Word diffs" bind:checked={globalOptions.wordDiffs} />
                    <LabeledCheckbox labelText="Line wrapping" bind:checked={globalOptions.lineWrap} />
                    <div class="flex justify-between px-2 py-1">
                        <Label.Root id="sidebarLocationLabel" for="sidebarLocation">Sidebar location</Label.Root>
                        <SimpleRadioGroup
                            id="sidebarLocation"
                            aria-labelledby="sidebarLocationLabel"
                            values={["left", "right"]}
                            bind:value={globalOptions.sidebarLocation}
                        />
                    </div>
                </SettingsGroup>
            </div>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

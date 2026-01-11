<script lang="ts">
    import { getFileStatusProps } from "$lib/diff-viewer.svelte";
    import { Button, Dialog, ToggleGroup } from "bits-ui";
    import { tryCompileRegex } from "$lib/util";
    import { FILE_STATUSES } from "$lib/github.svelte";
    import { slide } from "svelte/transition";
    import { type DiffFilterDialogProps, type FilePathFilterMode } from "$lib/components/diff-filtering/index.svelte";

    let { instance, title, open = $bindable() }: DiffFilterDialogProps = $props();

    let newFilePathFilterElement: HTMLInputElement | undefined = $state();
    let newFilePathFilterInput = $state("");
    let newFilePathFilterInputResult = $derived(tryCompileRegex(newFilePathFilterInput));
    $effect(() => {
        if (newFilePathFilterElement && newFilePathFilterInputResult.success) {
            newFilePathFilterElement.setCustomValidity("");
        } else if (newFilePathFilterElement && !newFilePathFilterInputResult.success) {
            newFilePathFilterElement.setCustomValidity(newFilePathFilterInputResult.error);
        }
    });

    let newFilePathFilterMode: FilePathFilterMode = $state("exclude");
</script>

<Dialog.Root bind:open>
    <Dialog.Portal>
        <Dialog.Overlay
            class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <Dialog.Content
            class="fixed top-1/2 left-1/2 z-50 flex max-h-svh w-2xl max-w-full -translate-x-1/2 -translate-y-1/2 flex-col rounded-sm border bg-neutral shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-[95%]"
        >
            <header class="flex shrink-0 flex-row items-center justify-between rounded-t-sm border-b bg-neutral-2 p-4">
                <Dialog.Title class="text-xl font-semibold">{title}</Dialog.Title>
                <Dialog.Close title="Close dialog" class="flex size-6 items-center justify-center rounded-sm btn-ghost text-em-med">
                    <span class="iconify octicon--x-16" aria-hidden="true"></span>
                </Dialog.Close>
            </header>

            <section class="m-4">
                <header class="px-2 py-1 text-lg font-semibold">File Status</header>
                <ToggleGroup.Root class="flex flex-wrap gap-0.5" type="multiple" bind:value={instance.selectedFileStatuses}>
                    {#each FILE_STATUSES as status (status)}
                        {@const statusProps = getFileStatusProps(status)}
                        <ToggleGroup.Item
                            aria-label="Toggle {statusProps.title} Files"
                            value={status}
                            class="flex cursor-pointer items-center gap-1 rounded-sm btn-ghost px-2 py-1 data-[state=off]:text-em-med data-[state=off]:hover:text-em-high data-[state=on]:btn-ghost-visible"
                        >
                            <span class="aria-hidden size-4 {statusProps.iconClasses}"></span>
                            {statusProps.title}
                        </ToggleGroup.Item>
                    {/each}
                </ToggleGroup.Root>
                {#if instance.selectedFileStatuses.length === 0}
                    <p transition:slide class="px-2 text-em-med italic">No file statuses selected; all files will be excluded.</p>
                {/if}
            </section>

            <section class="m-4 mt-0">
                <header class="px-2 py-1 text-lg font-semibold">File Path</header>
                <div class="flex flex-col">
                    <form
                        class="mb-1 flex w-full items-center gap-1"
                        onsubmit={(e) => {
                            e.preventDefault();
                            if (!newFilePathFilterInputResult.success) return;
                            instance.addFilePathFilter(newFilePathFilterInputResult, newFilePathFilterMode);
                            newFilePathFilterInput = "";
                        }}
                    >
                        <input
                            type="text"
                            placeholder="Enter regular expression here..."
                            class="grow rounded-md border px-2 py-1 inset-shadow-xs ring-focus focus:outline-none focus-visible:ring-2"
                            bind:value={newFilePathFilterInput}
                            bind:this={newFilePathFilterElement}
                        />
                        <Button.Root
                            type="button"
                            title="Toggle include/exclude mode (currently {newFilePathFilterMode})"
                            class="flex shrink-0 items-center justify-center rounded-md btn-fill-neutral p-2 text-em-med"
                            onclick={() => {
                                newFilePathFilterMode = newFilePathFilterMode === "exclude" ? "include" : "exclude";
                            }}
                        >
                            {#if newFilePathFilterMode === "exclude"}
                                <span class="aria-hidden iconify octicon--filter-remove-16"></span>
                            {:else}
                                <span class="aria-hidden iconify octicon--filter-16"></span>
                            {/if}
                        </Button.Root>
                        <Button.Root type="submit" title="Add filter" class="flex shrink-0 items-center justify-center rounded-md btn-fill-primary p-2">
                            <span class="iconify size-4 shrink-0 place-self-center octicon--plus-16" aria-hidden="true"></span>
                        </Button.Root>
                    </form>
                    <ul class="h-48 overflow-y-auto rounded-md border inset-shadow-xs">
                        {#each instance.reverseFilePathFilters as filter, i (i)}
                            <li class="flex gap-1 border-b px-2 py-1">
                                <span class="grow">
                                    {filter.text}
                                </span>
                                <div class="flex size-6 shrink-0 items-center justify-center">
                                    {#if filter.mode === "exclude"}
                                        <span class="aria-hidden iconify size-4 text-em-med octicon--filter-remove-16"></span>
                                    {:else}
                                        <span class="aria-hidden iconify size-4 text-em-med octicon--filter-16"></span>
                                    {/if}
                                </div>
                                <Button.Root
                                    type="button"
                                    title="Delete filter"
                                    class="flex size-6 items-center justify-center rounded-sm btn-ghost-danger"
                                    onclick={() => {
                                        instance.filePathFilters.delete(filter);
                                    }}
                                >
                                    <span class="iconify size-4 shrink-0 place-self-center octicon--trash-16" aria-hidden="true"></span>
                                </Button.Root>
                            </li>
                        {/each}
                        {#if instance.reverseFilePathFilters.length === 0}
                            <li class="flex size-full items-center justify-center px-4 text-em-med">No file path filters. Add one using the above form.</li>
                        {/if}
                    </ul>
                </div>
            </section>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

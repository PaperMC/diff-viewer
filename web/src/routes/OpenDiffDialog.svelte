<script lang="ts">
    import { getGithubUsername, installGithubApp, loginWithGithub, logoutGithub } from "$lib/github.svelte";
    import { Button, Dialog, Separator, Popover } from "bits-ui";
    import InfoPopup from "$lib/components/InfoPopup.svelte";
    import { page } from "$app/state";
    import { onMount } from "svelte";
    import DirectorySelect from "$lib/components/files/DirectorySelect.svelte";
    import MultimodalFileInput from "$lib/components/files/MultimodalFileInput.svelte";
    import { flip } from "svelte/animate";
    import { OpenDiffDialogState, type OpenDiffDialogProps } from "$lib/open-diff-dialog.svelte";
    import { box } from "svelte-toolbelt";
    import { GITHUB_URL_PARAM, PATCH_URL_PARAM } from "$lib/diff-viewer.svelte";

    let { open = $bindable(false) }: OpenDiffDialogProps = $props();

    const instance = new OpenDiffDialogState({
        open: box.with(
            () => open,
            (v) => (open = v),
        ),
    });

    onMount(async () => {
        const githubUrlParam = page.url.searchParams.get(GITHUB_URL_PARAM);
        const patchUrlParam = page.url.searchParams.get(PATCH_URL_PARAM);

        if (githubUrlParam !== null) {
            instance.githubUrl = githubUrlParam;
            await instance.handleGithubUrl({ state: "replace" });
        } else if (patchUrlParam !== null) {
            instance.patchFile.reset();
            instance.patchFile.mode = "url";
            instance.patchFile.url = patchUrlParam;
            await instance.handlePatchFile({ state: "replace" });
        } else {
            open = true;
        }
    });
</script>

{#snippet blacklistPopoverContent()}
    <div class="mb-2 flex bg-neutral-2 py-2 ps-2 pe-6">
        <span class="me-1 text-lg font-semibold">Blacklist patterns</span>
        <InfoPopup>Regex patterns for directories and files to ignore.</InfoPopup>
    </div>
    <div class="flex items-center gap-1 px-2">
        <form
            class="flex"
            onsubmit={(e) => {
                e.preventDefault();
                instance.addBlacklistEntry();
            }}
        >
            <input bind:value={instance.dirBlacklistInput} type="text" class="w-full rounded-l-md border-t border-b border-l px-2 py-1 inset-shadow-xs" />
            <Button.Root type="submit" title="Add blacklist entry" class="flex rounded-r-md btn-fill-primary px-2 py-1">
                <span class="iconify size-4 shrink-0 place-self-center octicon--plus-16" aria-hidden="true"></span>
            </Button.Root>
        </form>
        <Button.Root
            title="Reset blacklist to defaults"
            class="flex rounded-md btn-fill-danger p-1"
            onclick={() => {
                instance.resetBlacklist();
            }}
        >
            <span class="iconify size-4 shrink-0 place-self-center octicon--undo-16" aria-hidden="true"></span>
        </Button.Root>
    </div>
    <ul class="m-2 max-h-96 overflow-y-auto rounded-md border">
        {#each instance.dirBlacklist as entry, index (entry)}
            <li class="flex" class:border-b={index !== instance.dirBlacklist.size - 1}>
                <span class="grow px-2 py-1">{entry}</span>
                <div class="p-1 ps-0">
                    <Button.Root
                        title="Delete blacklist entry"
                        class="flex rounded-md btn-fill-danger p-1"
                        onclick={() => {
                            instance.dirBlacklist.delete(entry);
                        }}
                    >
                        <span class="iconify size-4 shrink-0 place-self-center octicon--trash-16" aria-hidden="true"></span>
                    </Button.Root>
                </div>
            </li>
        {/each}
        {#if instance.dirBlacklist.size === 0}
            <li class="px-2 py-1 text-em-med">No patterns added</li>
        {/if}
    </ul>
{/snippet}

{#snippet githubSection()}
    <section class="flex flex-col p-4">
        <h3 class="mb-4 flex items-center gap-1 text-lg font-semibold">
            <span class="iconify size-6 shrink-0 octicon--mark-github-24"></span>
            From GitHub
        </h3>

        <form
            class="flex flex-row"
            onsubmit={(e) => {
                e.preventDefault();
                instance.handleGithubUrl();
            }}
        >
            <input
                id="githubUrl"
                type="url"
                required
                autocomplete="url"
                placeholder="https://github.com/"
                class="grow rounded-l-md border-t border-b border-l bg-neutral px-2 py-1 overflow-ellipsis inset-shadow-xs ring-focus focus:z-1 focus:outline-none focus-visible:ring-2"
                bind:value={instance.githubUrl}
            />
            <Button.Root type="submit" class="rounded-r-md btn-fill-primary px-2 py-1">Go</Button.Root>
        </form>
        <span class="mb-2 text-sm text-em-med">Supports commit, PR, and comparison URLs</span>

        <div class="mb-2 flex flex-row gap-1">
            {#if getGithubUsername()}
                <div class="flex w-fit flex-row items-center justify-between gap-2 px-2 py-1">
                    <span class="iconify shrink-0 octicon--person-16"></span>
                    {getGithubUsername()}
                </div>
                <Button.Root class="flex items-center gap-2 rounded-md btn-fill-danger px-2 py-1" onclick={logoutGithub}>
                    <span class="iconify shrink-0 octicon--sign-out-16"></span>
                    Sign out
                </Button.Root>
            {:else}
                <Button.Root class="flex w-fit flex-row items-center justify-between gap-2 rounded-md btn-fill-neutral px-2 py-1" onclick={loginWithGithub}>
                    <span class="iconify shrink-0 text-em-med octicon--sign-in-16"></span>
                    Sign in to GitHub
                </Button.Root>
                <InfoPopup>
                    Sign in to GitHub for higher rate limits and private repository access. Only private repositories configured for the GitHub app will be
                    accessible.
                </InfoPopup>
            {/if}
        </div>

        <div class="flex flex-row gap-1">
            <Button.Root class="flex w-fit flex-row items-center gap-2 rounded-md btn-fill-neutral px-2 py-1" onclick={installGithubApp}>
                <span class="iconify shrink-0 text-em-med octicon--gear-16"></span>
                Configure GitHub App
            </Button.Root>
            <InfoPopup>
                In order to view a private repository, the repository owner must have installed the GitHub app and granted it access to the repository. Then,
                authenticated users will be able to load diffs they have read access to.
            </InfoPopup>
        </div>
    </section>
{/snippet}

{#snippet patchSection()}
    <form
        class="p-4"
        onsubmit={(e) => {
            e.preventDefault();
            instance.handlePatchFile();
        }}
    >
        <h3 class="mb-4 flex items-center gap-1 text-lg font-semibold">
            <span class="iconify size-6 shrink-0 octicon--file-diff-24"></span>
            From Patch File
        </h3>
        <MultimodalFileInput bind:state={instance.patchFile} required fileTypeOverride={false} defaultMode="file" label="Patch File" />
        <Button.Root type="submit" class="mt-2 rounded-md btn-fill-primary px-2 py-1">Go</Button.Root>
    </form>
{/snippet}

{#snippet filesSection()}
    <form
        class="p-4"
        onsubmit={(e) => {
            e.preventDefault();
            instance.compareFiles();
        }}
    >
        <h3 class="mb-4 flex items-center gap-1 text-lg font-semibold">
            <span class="iconify size-6 shrink-0 octicon--file-24"></span>
            From Files
            <InfoPopup>
                Compares any two texts or images. For files, the file type (text or image, and language) is inferred from the file extension and content. The
                file type can be overridden for text to control syntax highlighting.
            </InfoPopup>
        </h3>
        <div class="mb-2 flex flex-col gap-1">
            {#each instance.flipFiles as id, index (id)}
                <div animate:flip={{ duration: 250 }}>
                    {#if id === "1"}
                        <MultimodalFileInput bind:state={instance.fileOne} required label={index === 0 ? "File A" : "File B"} />
                    {:else if id === "arrow"}
                        <div class="flex w-full">
                            <span class="iconify size-4 shrink-0 octicon--arrow-down-16"></span>
                        </div>
                    {:else if id === "2"}
                        <MultimodalFileInput bind:state={instance.fileTwo} required label={index === 2 ? "File B" : "File A"} />
                    {/if}
                </div>
            {/each}
        </div>
        <div class="flex items-center gap-1">
            <Button.Root type="submit" class="rounded-md btn-fill-primary px-2 py-1">Go</Button.Root>
            <Button.Root
                title="Swap File A and File B"
                type="button"
                class="flex size-6 items-center justify-center rounded-md btn-fill-neutral"
                onclick={() => {
                    const a = instance.flipFiles[0];
                    instance.flipFiles[0] = instance.flipFiles[2];
                    instance.flipFiles[2] = a;
                }}
            >
                <span class="iconify size-4 shrink-0 rotate-90 text-em-med octicon--arrow-switch-16" aria-hidden="true"></span>
            </Button.Root>
        </div>
    </form>
{/snippet}

{#snippet directoriesSection()}
    <form
        class="p-4"
        onsubmit={(e) => {
            e.preventDefault();
            instance.compareDirs();
        }}
    >
        <h3 class="mb-4 flex items-center gap-1 text-lg font-semibold">
            <span class="iconify size-6 shrink-0 octicon--file-directory-24"></span>
            From Directories
            <InfoPopup>
                Compares the entire contents of the directories, including subdirectories. Does not attempt to detect renames. When possible, preparing a
                unified diff (<code class="rounded-sm bg-neutral-2 px-1 py-0.5">.patch</code> file) using Git or another tool and loading it with the above button
                should be preferred.
            </InfoPopup>
        </h3>
        <div class="mb-2 flex w-full flex-col gap-1">
            {#each instance.flipDirs as id, index (id)}
                <div animate:flip={{ duration: 250 }} class="flex">
                    {#if id === "1"}
                        <DirectorySelect bind:directory={instance.dirOne} placeholder={index === 0 ? "Directory A" : "Directory B"} />
                    {:else if id === "arrow"}
                        <span class="iconify size-4 shrink-0 octicon--arrow-down-16"></span>
                    {:else if id === "2"}
                        <DirectorySelect bind:directory={instance.dirTwo} placeholder={index === 2 ? "Directory B" : "Directory A"} />
                    {/if}
                </div>
            {/each}
        </div>
        <div class="flex items-center gap-1">
            <Button.Root type="submit" class="rounded-md btn-fill-primary px-2 py-1">Go</Button.Root>
            <Popover.Root>
                <Popover.Trigger
                    title="Edit filters"
                    class="flex size-6 items-center justify-center rounded-md btn-fill-neutral data-[state=open]:bg-(--btn-hover)"
                >
                    <span class="iconify size-4 shrink-0 text-em-med octicon--filter-16" aria-hidden="true"></span>
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content side="top" class="z-50 mx-2 overflow-hidden rounded-md border bg-neutral">
                        {@render blacklistPopoverContent()}
                        <Popover.Arrow class="text-edge" />
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>
            <Button.Root
                title="Swap Directory A and Directory B"
                type="button"
                class="flex size-6 items-center justify-center rounded-md btn-fill-neutral"
                onclick={() => {
                    const a = instance.flipDirs[0];
                    instance.flipDirs[0] = instance.flipDirs[2];
                    instance.flipDirs[2] = a;
                }}
            >
                <span class="iconify size-4 shrink-0 rotate-90 text-em-med octicon--arrow-switch-16" aria-hidden="true"></span>
            </Button.Root>
        </div>
    </form>
{/snippet}

<Dialog.Root bind:open>
    <Dialog.Portal>
        <Dialog.Overlay
            class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <Dialog.Content
            class="fixed top-1/2 left-1/2 z-50 flex max-h-svh w-3xl max-w-full -translate-x-1/2 -translate-y-1/2 flex-col rounded-sm border bg-neutral shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-[95%]"
        >
            <header class="flex shrink-0 flex-row items-center justify-between rounded-t-sm border-b bg-neutral-2 p-4">
                <Dialog.Title class="text-xl font-semibold">Open New Diff</Dialog.Title>
                <Dialog.Close title="Close dialog" class="flex size-6 items-center justify-center rounded-sm btn-ghost text-em-med">
                    <span class="iconify octicon--x-16" aria-hidden="true"></span>
                </Dialog.Close>
            </header>

            <div class="grow overflow-y-auto">
                {@render filesSection()}
                <Separator.Root class="h-0 w-full border-b" />
                {@render githubSection()}
                <Separator.Root class="h-0 w-full border-b" />
                {@render directoriesSection()}
                <Separator.Root class="h-0 w-full border-b" />
                {@render patchSection()}
            </div>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

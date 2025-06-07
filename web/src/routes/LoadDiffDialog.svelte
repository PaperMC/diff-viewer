<script lang="ts">
    import { type FileStatus, getGithubUsername, GITHUB_URL_PARAM, installGithubApp, loginWithGithub, logoutGithub } from "$lib/github.svelte";
    import { Button, Dialog, Separator, Popover } from "bits-ui";
    import InfoPopup from "./InfoPopup.svelte";
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
    import { type FileDetails, MultiFileDiffViewerState } from "$lib/diff-viewer-multi-file.svelte";
    import { binaryFileDummyDetails, bytesEqual, isBinaryFile, isImageFile, splitMultiFilePatch } from "$lib/util";
    import { onMount } from "svelte";
    import { createTwoFilesPatch } from "diff";
    import DirectorySelect from "$lib/components/files/DirectorySelect.svelte";
    import { DirectoryEntry, FileEntry, MultimodalFileInputState } from "$lib/components/files/index.svelte";
    import { SvelteSet } from "svelte/reactivity";
    import MultimodalFileInput from "$lib/components/files/MultimodalFileInput.svelte";

    const viewer = MultiFileDiffViewerState.get();
    let modalOpen = $state(false);

    let githubUrl = $state("https://github.com/");

    let patchFile = $state<MultimodalFileInputState | undefined>();

    let fileA = $state<MultimodalFileInputState | undefined>();
    let fileB = $state<MultimodalFileInputState | undefined>();

    let dirA = $state<DirectoryEntry | undefined>();
    let dirB = $state<DirectoryEntry | undefined>();
    let dirBlacklistInput = $state<string>("");
    const defaultDirBlacklist = [".git/"];
    let dirBlacklist = new SvelteSet(defaultDirBlacklist);
    let dirBlacklistRegexes = $derived.by(() => {
        return Array.from(dirBlacklist).map((pattern) => new RegExp(pattern));
    });

    function addBlacklistEntry() {
        if (dirBlacklistInput === "") {
            return;
        }
        try {
            new RegExp(dirBlacklistInput); // Validate regex
        } catch (e) {
            alert("'" + dirBlacklistInput + "' is not a valid regex pattern. Error: " + e);
            return;
        }
        dirBlacklist.add(dirBlacklistInput);
        dirBlacklistInput = "";
    }

    onMount(async () => {
        const url = page.url.searchParams.get(GITHUB_URL_PARAM);
        if (url !== null) {
            githubUrl = url;
            await handleGithubUrl();
        } else {
            modalOpen = true;
        }
    });

    async function compareFiles() {
        if (!fileA || !fileB || !fileA.metadata || !fileB.metadata) {
            alert("Both files must be selected to compare.");
            return;
        }
        const isImageDiff = isImageFile(fileA.metadata.name) && isImageFile(fileB.metadata.name);
        let blobA: Blob, blobB: Blob;
        try {
            [blobA, blobB] = await Promise.all([fileA.resolve(), fileB.resolve()]);
        } catch (e) {
            console.log("Failed to resolve files:", e);
            alert("Failed to resolve files: " + e);
            return;
        }
        const [aBinary, bBinary] = await Promise.all([isBinaryFile(blobA), isBinaryFile(blobB)]);
        if (aBinary || bBinary) {
            if (!isImageDiff) {
                alert("Cannot compare binary files (except image-to-image comparisons).");
                return;
            }
        }

        const fileDetails: FileDetails[] = [];

        if (isImageDiff) {
            if (await bytesEqual(blobA, blobB)) {
                alert("The files are identical.");
                return;
            }

            let status: FileStatus = "modified";
            if (fileA.metadata.name !== fileB.metadata.name) {
                status = "renamed_modified";
            }

            fileDetails.push({
                content: "",
                fromFile: fileA.metadata.name,
                toFile: fileB.metadata.name,
                fromBlob: blobA,
                toBlob: blobB,
                status,
            });
        } else {
            const [textA, textB] = await Promise.all([blobA.text(), blobB.text()]);
            if (textA === textB) {
                alert("The files are identical.");
                return;
            }

            const diff = createTwoFilesPatch(fileA.metadata.name, fileB.metadata.name, textA, textB);
            let status: FileStatus = "modified";
            if (fileA.metadata.name !== fileB.metadata.name) {
                status = "renamed_modified";
            }

            fileDetails.push({
                content: diff,
                fromFile: fileA.metadata.name,
                toFile: fileB.metadata.name,
                status,
            });
        }

        viewer.loadPatches(fileDetails, { fileName: `${fileA.metadata.name}...${fileB.metadata.name}.patch` });
        await updateUrlParams();
        modalOpen = false;
    }

    type ProtoFileDetails = {
        path: string;
        file: File;
    };

    async function compareDirs() {
        if (!dirA || !dirB) {
            alert("Both directories must be selected to compare.");
            return;
        }

        const blacklist = (entry: ProtoFileDetails) => {
            return !dirBlacklistRegexes.some((pattern) => pattern.test(entry.path));
        };
        const entriesA: ProtoFileDetails[] = flatten(dirA).filter(blacklist);
        const entriesAMap = new Map(entriesA.map((entry) => [entry.path, entry]));
        const entriesB: ProtoFileDetails[] = flatten(dirB).filter(blacklist);
        const entriesBMap = new Map(entriesB.map((entry) => [entry.path, entry]));

        const fileDetails: FileDetails[] = [];
        for (const entry of entriesA) {
            const entryB = entriesBMap.get(entry.path);
            if (entryB) {
                // File exists in both directories
                const [aBinary, bBinary] = await Promise.all([isBinaryFile(entry.file), isBinaryFile(entryB.file)]);

                if (aBinary || bBinary) {
                    if (await bytesEqual(entry.file, entryB.file)) {
                        // Files are identical
                        continue;
                    }
                    if (isImageFile(entry.file.name) && isImageFile(entryB.file.name)) {
                        fileDetails.push({
                            content: "",
                            fromFile: entry.path,
                            toFile: entryB.path,
                            fromBlob: entry.file,
                            toBlob: entryB.file,
                            status: "modified",
                        });
                    } else {
                        fileDetails.push(binaryFileDummyDetails(entry.path, entryB.path, "modified"));
                    }
                } else {
                    const [textA, textB] = await Promise.all([entry.file.text(), entryB.file.text()]);
                    if (textA === textB) {
                        // Files are identical
                        continue;
                    }
                    fileDetails.push({
                        content: createTwoFilesPatch(entry.path, entryB.path, textA, textB),
                        fromFile: entry.path,
                        toFile: entryB.path,
                        status: "modified",
                    });
                }
            } else if (isImageFile(entry.file.name)) {
                // Image file removed
                fileDetails.push({
                    content: "",
                    fromFile: entry.path,
                    toFile: entry.path,
                    fromBlob: entry.file,
                    toBlob: entry.file,
                    status: "removed",
                });
            } else if (await isBinaryFile(entry.file)) {
                // Binary file removed
                fileDetails.push(binaryFileDummyDetails(entry.path, entry.path, "removed"));
            } else {
                // Text file removed
                fileDetails.push({
                    content: createTwoFilesPatch(entry.path, "", await entry.file.text(), ""),
                    fromFile: entry.path,
                    toFile: entry.path,
                    status: "removed",
                });
            }
        }

        // Check for added files
        for (const entry of entriesB) {
            const entryA = entriesAMap.get(entry.path);
            if (!entryA) {
                if (isImageFile(entry.file.name)) {
                    fileDetails.push({
                        content: "",
                        fromFile: entry.path,
                        toFile: entry.path,
                        fromBlob: entry.file,
                        toBlob: entry.file,
                        status: "added",
                    });
                } else if (await isBinaryFile(entry.file)) {
                    fileDetails.push(binaryFileDummyDetails(entry.path, entry.path, "added"));
                } else {
                    fileDetails.push({
                        content: createTwoFilesPatch("", entry.path, "", await entry.file.text()),
                        fromFile: entry.path,
                        toFile: entry.path,
                        status: "added",
                    });
                }
            }
        }

        viewer.loadPatches(fileDetails, { fileName: `${dirA.fileName}...${dirB.fileName}.patch` });
        await updateUrlParams();
        modalOpen = false;
    }

    function flatten(dir: DirectoryEntry): ProtoFileDetails[] {
        type StackEntry = {
            directory: DirectoryEntry;
            prefix: string;
        };
        const into: ProtoFileDetails[] = [];
        const stack: StackEntry[] = [{ directory: dir, prefix: "" }];

        while (stack.length > 0) {
            const { directory, prefix: currentPrefix } = stack.pop()!;

            for (const entry of directory.children) {
                if (entry instanceof DirectoryEntry) {
                    stack.push({
                        directory: entry,
                        prefix: currentPrefix + entry.fileName + "/",
                    });
                } else if (entry instanceof FileEntry) {
                    into.push({
                        path: currentPrefix + entry.fileName,
                        file: entry.file,
                    });
                }
            }
        }

        return into;
    }

    async function handlePatchFile() {
        if (!patchFile || !patchFile.metadata) {
            alert("No patch file selected.");
            return;
        }
        let text: string;
        try {
            const blob = await patchFile.resolve();
            text = await blob.text();
        } catch (e) {
            console.error("Failed to resolve patch file:", e);
            alert("Failed to resolve patch file: " + e);
            return;
        }
        const files = splitMultiFilePatch(text);
        if (files.length === 0) {
            alert("No valid patches found in the file.");
            return;
        }
        modalOpen = false;
        viewer.loadPatches(files, { fileName: patchFile.metadata.name });
        await updateUrlParams();
    }

    async function handleGithubUrl() {
        const url = new URL(githubUrl);
        // exclude hash + query params
        const test = url.protocol + "//" + url.hostname + url.pathname;

        const regex = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(commit|pull|compare)\/(.+)/;
        const match = test.match(regex);

        if (!match) {
            alert("Invalid GitHub URL. Use: https://github.com/owner/repo/(commit|pull|compare)/(id|ref_a...ref_b)");
            return;
        }

        githubUrl = match[0];
        modalOpen = false;
        const success = await viewer.loadFromGithubApi(match);
        if (success) {
            await updateUrlParams({ githubUrl });
            return;
        }
        modalOpen = true;
    }

    async function updateUrlParams(opts: { githubUrl?: string } = {}) {
        const newUrl = new URL(page.url);
        if (opts.githubUrl) {
            newUrl.searchParams.set(GITHUB_URL_PARAM, opts.githubUrl);
        } else {
            newUrl.searchParams.delete(GITHUB_URL_PARAM);
        }
        await goto(`?${newUrl.searchParams}`);
    }
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
                addBlacklistEntry();
            }}
        >
            <input bind:value={dirBlacklistInput} type="text" class="w-full rounded-l-md border-t border-b border-l px-2 py-1" />
            <Button.Root type="submit" title="Add blacklist entry" class="flex rounded-r-md btn-primary px-2 py-1">
                <span class="iconify size-4 shrink-0 place-self-center octicon--plus-16" aria-hidden="true"></span>
            </Button.Root>
        </form>
        <Button.Root
            title="Reset blacklist to defaults"
            class="flex rounded-md btn-danger p-1"
            onclick={() => {
                dirBlacklist.clear();
                defaultDirBlacklist.forEach((entry) => {
                    dirBlacklist.add(entry);
                });
            }}
        >
            <span class="iconify size-4 shrink-0 place-self-center octicon--undo-16" aria-hidden="true"></span>
        </Button.Root>
    </div>
    <ul class="m-2 max-h-96 overflow-y-auto rounded-md border">
        {#each dirBlacklist as entry, index (entry)}
            <li class="flex" class:border-b={index !== dirBlacklist.size - 1}>
                <span class="grow px-2 py-1">{entry}</span>
                <div class="p-1 ps-0">
                    <Button.Root
                        title="Delete blacklist entry"
                        class="flex rounded-md btn-danger p-1"
                        onclick={() => {
                            dirBlacklist.delete(entry);
                        }}
                    >
                        <span class="iconify size-4 shrink-0 place-self-center octicon--trash-16" aria-hidden="true"></span>
                    </Button.Root>
                </div>
            </li>
        {/each}
        {#if dirBlacklist.size === 0}
            <li class="px-2 py-1 text-em-med">No patterns added</li>
        {/if}
    </ul>
{/snippet}

<Dialog.Root bind:open={modalOpen}>
    <Dialog.Trigger class="h-fit rounded-md btn-primary px-2 py-0.5">Load another diff</Dialog.Trigger>
    <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 dark:bg-white/20" />
        <Dialog.Content
            class="fixed top-1/2 left-1/2 z-50 max-h-svh w-192 max-w-full -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-neutral shadow-md sm:max-w-[95%]"
        >
            <header class="sticky top-0 z-10 flex flex-row items-center justify-between rounded-t-md bg-neutral-2 p-4">
                <Dialog.Title class="text-xl font-semibold">Load a diff</Dialog.Title>
                <Dialog.Close title="Close dialog" class="flex size-6 items-center justify-center rounded-md btn-ghost text-primary">
                    <span class="iconify octicon--x-16" aria-hidden="true"></span>
                </Dialog.Close>
            </header>

            <section class="flex flex-col p-4">
                <h3 class="mb-2 flex items-center gap-1 text-lg font-semibold">
                    <span class="iconify size-6 shrink-0 octicon--mark-github-24"></span>
                    From GitHub
                </h3>

                <form
                    class="flex flex-row"
                    onsubmit={(e) => {
                        e.preventDefault();
                        handleGithubUrl();
                    }}
                >
                    <input
                        id="githubUrl"
                        type="url"
                        required
                        autocomplete="url"
                        placeholder="https://github.com/"
                        class="grow rounded-l-md border-t border-b border-l px-2 py-1 overflow-ellipsis"
                        bind:value={githubUrl}
                    />
                    <Button.Root type="submit" class="rounded-r-md btn-primary px-2 py-1">Go</Button.Root>
                </form>
                <span class="mb-2 text-sm text-em-med">Supports commit, PR, and comparison URLs</span>

                <div class="mb-2 flex flex-row gap-1">
                    {#if getGithubUsername()}
                        <div class="flex w-fit flex-row items-center justify-between gap-2 px-2 py-1">
                            <span class="iconify shrink-0 octicon--person-16"></span>
                            {getGithubUsername()}
                        </div>
                        <Button.Root class="flex items-center gap-2 rounded-md btn-danger px-2 py-1" onclick={logoutGithub}>
                            <span class="iconify shrink-0 octicon--sign-out-16"></span>
                            Sign out
                        </Button.Root>
                    {:else}
                        <Button.Root class="flex w-fit flex-row items-center justify-between gap-2 rounded-md btn-primary px-2 py-1" onclick={loginWithGithub}>
                            <span class="iconify shrink-0 octicon--sign-in-16"></span>
                            Sign in to GitHub
                        </Button.Root>
                        <InfoPopup>
                            Sign in to GitHub for higher rate limits and private repository access. Only private repositories configured for the GitHub app will
                            be accessible.
                        </InfoPopup>
                    {/if}
                </div>

                <div class="flex flex-row gap-1">
                    <Button.Root class="flex w-fit flex-row items-center gap-2 rounded-md btn-primary px-2 py-1" onclick={installGithubApp}>
                        <span class="iconify shrink-0 octicon--gear-16"></span>
                        Configure GitHub App
                    </Button.Root>
                    <InfoPopup>
                        In order to view a private repository, the repository owner must have installed the GitHub app and granted it access to the repository.
                        Then, authenticated users will be able to load diffs they have read access to.
                    </InfoPopup>
                </div>
            </section>

            <Separator.Root class="h-px w-full bg-neutral-2" />

            <form
                class="p-4"
                onsubmit={(e) => {
                    e.preventDefault();
                    handlePatchFile();
                }}
            >
                <h3 class="mb-2 flex items-center gap-1 text-lg font-semibold">
                    <span class="iconify size-6 shrink-0 octicon--file-diff-24"></span>
                    From Patch File
                </h3>
                <MultimodalFileInput bind:state={patchFile} required fileTypeOverride={false} label="Patch File" />
                <Button.Root type="submit" class="mt-1 rounded-md btn-primary px-2 py-1">Go</Button.Root>
            </form>

            <Separator.Root class="h-px w-full bg-neutral-2" />

            <form
                class="p-4"
                onsubmit={(e) => {
                    e.preventDefault();
                    compareFiles();
                }}
            >
                <h3 class="mb-2 flex items-center gap-1 text-lg font-semibold">
                    <span class="iconify size-6 shrink-0 octicon--file-24"></span>
                    From Files
                </h3>
                <div class="flex flex-wrap items-center gap-1">
                    <MultimodalFileInput bind:state={fileA} required label="File A" />
                    <div class="flex w-full">
                        <span class="iconify size-4 shrink-0 octicon--arrow-down-16"></span>
                    </div>
                    <MultimodalFileInput bind:state={fileB} required label="File B" />
                    <Button.Root type="submit" class="rounded-md btn-primary px-2 py-1">Go</Button.Root>
                    <Button.Root
                        title="Swap File A and File B"
                        type="button"
                        class="flex size-6 items-center justify-center rounded-md btn-primary"
                        onclick={() => {
                            if (!fileA || !fileB) return;
                            fileA.swapState(fileB);
                        }}
                    >
                        <span class="iconify size-4 shrink-0 octicon--arrow-switch-16" aria-hidden="true"></span>
                    </Button.Root>
                </div>
            </form>

            <Separator.Root class="h-px w-full bg-neutral-2" />

            <form
                class="p-4"
                onsubmit={(e) => {
                    e.preventDefault();
                    compareDirs();
                }}
            >
                <h3 class="mb-2 flex items-center gap-1 text-lg font-semibold">
                    <span class="iconify size-6 shrink-0 octicon--file-directory-24"></span>
                    From Directories
                    <InfoPopup>
                        Compares the entire contents of the directories, including subdirectories. Does not attempt to detect renames. When possible, preparing
                        a unified diff (<code class="rounded-sm bg-neutral-2 px-1 py-0.5">.patch</code> file) using Git or another tool and loading it with the above
                        button should be preferred.
                    </InfoPopup>
                </h3>
                <div class="flex flex-wrap items-center gap-1">
                    <DirectorySelect bind:directory={dirA} placeholder="Directory A" />
                    <span class="iconify size-4 shrink-0 octicon--arrow-right-16"></span>
                    <DirectorySelect bind:directory={dirB} placeholder="Directory B" />
                    <Button.Root type="submit" class="rounded-md btn-primary px-2 py-1">Go</Button.Root>
                    <Popover.Root>
                        <Popover.Trigger
                            title="Edit filters"
                            class="flex size-6 items-center justify-center rounded-md btn-primary data-[state=open]:btn-primary-hover"
                        >
                            <span class="iconify size-4 shrink-0 octicon--filter-16" aria-hidden="true"></span>
                        </Popover.Trigger>
                        <Popover.Portal>
                            <Popover.Content side="top" class="z-50 mx-2 overflow-hidden rounded-md border bg-neutral">
                                {@render blacklistPopoverContent()}
                                <Popover.Arrow class="text-edge" />
                            </Popover.Content>
                        </Popover.Portal>
                    </Popover.Root>
                </div>
            </form>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

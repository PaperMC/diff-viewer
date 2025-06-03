<script lang="ts">
    import { type FileStatus, getGithubUsername, GITHUB_URL_PARAM, installGithubApp, loginWithGithub, logoutGithub } from "$lib/github.svelte";
    import { Button, Dialog, Separator, Popover } from "bits-ui";
    import InfoPopup from "./InfoPopup.svelte";
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
    import { type FileDetails, MultiFileDiffViewerState } from "$lib/diff-viewer-multi-file.svelte";
    import { binaryFileDummyDetails, bytesEqual, isBinaryFile, isImageFile, splitMultiFilePatch } from "$lib/util";
    import { onMount } from "svelte";
    import FileInput from "$lib/components/files/FileInput.svelte";
    import SingleFileSelect from "$lib/components/files/SingleFileSelect.svelte";
    import { createTwoFilesPatch } from "diff";
    import DirectorySelect from "$lib/components/files/DirectorySelect.svelte";
    import { DirectoryEntry, FileEntry } from "$lib/components/files/index.svelte";
    import { SvelteSet } from "svelte/reactivity";

    const viewer = MultiFileDiffViewerState.get();

    let modalOpen = $state(false);
    let githubUrl = $state("https://github.com/");
    let dragActive = $state(false);

    let fileA = $state<File | undefined>(undefined);
    let fileB = $state<File | undefined>(undefined);
    let dirA = $state<DirectoryEntry | undefined>(undefined);
    let dirB = $state<DirectoryEntry | undefined>(undefined);
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
        if (!fileA || !fileB) {
            alert("Both files must be selected to compare.");
            return;
        }

        const isImageDiff = isImageFile(fileA.name) && isImageFile(fileB.name);
        const [aBinary, bBinary] = await Promise.all([isBinaryFile(fileA), isBinaryFile(fileB)]);
        if (aBinary || bBinary) {
            if (!isImageDiff) {
                alert("Cannot compare binary files.");
                return;
            }
        }

        const fileDetails: FileDetails[] = [];

        if (isImageDiff) {
            if (await bytesEqual(fileA, fileB)) {
                alert("The files are identical.");
                return;
            }

            let status: FileStatus = "modified";
            if (fileA.name !== fileB.name) {
                status = "renamed_modified";
            }

            fileDetails.push({
                content: "",
                fromFile: fileA.name,
                toFile: fileB.name,
                fromBlob: fileA,
                toBlob: fileB,
                status,
            });
        } else {
            const [textA, textB] = await Promise.all([fileA.text(), fileB.text()]);
            if (textA === textB) {
                alert("The files are identical.");
                return;
            }

            const diff = createTwoFilesPatch(fileA.name, fileB.name, textA, textB);
            let status: FileStatus = "modified";
            if (fileA.name !== fileB.name) {
                status = "renamed_modified";
            }

            fileDetails.push({
                content: diff,
                fromFile: fileA.name,
                toFile: fileB.name,
                status,
            });
        }

        viewer.loadPatches(fileDetails, { fileName: `${fileA.name}...${fileB.name}.patch` });
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

    async function loadFromPatchFile(fileName: string, patchContent: string) {
        const files = splitMultiFilePatch(patchContent);
        if (files.length === 0) {
            alert("No valid patches found in the file.");
            modalOpen = true;
            return;
        }
        viewer.loadPatches(files, { fileName });
        await updateUrlParams();
    }

    async function handlePatchFile(file?: File) {
        if (!file) {
            return;
        }
        modalOpen = false;
        await loadFromPatchFile(file.name, await file.text());
    }

    function handleDragOver(event: DragEvent) {
        dragActive = true;
        event.preventDefault();
    }

    function handleDragLeave(event: DragEvent) {
        if (event.currentTarget === event.target) {
            dragActive = false;
        }
        event.preventDefault();
    }

    async function handlePatchFileDrop(event: DragEvent) {
        dragActive = false;
        event.preventDefault();
        const files = event.dataTransfer?.files;
        if (!files || files.length !== 1) {
            alert("Only one file can be dropped at a time.");
            return;
        }
        modalOpen = false;
        const file = files[0];
        await loadFromPatchFile(file.name, await file.text());
    }

    async function handleGithubUrl() {
        modalOpen = false;
        const url = new URL(githubUrl);
        // exclude hash + query params
        const test = url.protocol + "//" + url.hostname + url.pathname;

        const regex = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(commit|pull|compare)\/(.+)/;
        const match = test.match(regex);

        if (!match) {
            alert("Invalid GitHub URL. Use: https://github.com/owner/repo/(commit|pull|compare)/(id|ref_a...ref_b)");
            modalOpen = true;
            return;
        }

        githubUrl = match[0];
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
        <div class="flex">
            <input
                bind:value={dirBlacklistInput}
                onkeydown={(e) => {
                    if (e.key === "Enter") {
                        addBlacklistEntry();
                    }
                }}
                type="text"
                class="w-full rounded-l-md border-t border-b border-l px-2 py-1"
            />
            <Button.Root title="Add blacklist entry" class="flex rounded-r-md btn-primary px-2 py-1" onclick={addBlacklistEntry}>
                <span class="iconify size-4 shrink-0 place-self-center octicon--plus-16" aria-hidden="true"></span>
            </Button.Root>
        </div>
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
        {#each dirBlacklist as entry (entry)}
            <li class="flex">
                <span class="grow border-b px-2 py-1">{entry}</span>
                <div class="border-b p-1 ps-0">
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
    <Dialog.Trigger class="h-fit rounded-md btn-primary px-2 py-0.5" onclick={() => (dragActive = false)}>Load another diff</Dialog.Trigger>
    <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 dark:bg-white/20" />
        <Dialog.Content
            class="fixed top-1/2 left-1/2 z-50 max-h-svh w-192 max-w-[95%] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md bg-neutral shadow-md"
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

                <div class="flex flex-row">
                    <input
                        id="githubUrl"
                        type="url"
                        autocomplete="url"
                        placeholder="https://github.com/"
                        class="grow rounded-l-md border-t border-b border-l px-2 py-1 overflow-ellipsis"
                        bind:value={githubUrl}
                        onkeyup={(event) => {
                            if (event.key === "Enter") {
                                handleGithubUrl();
                            }
                        }}
                    />
                    <Button.Root onclick={handleGithubUrl} class="rounded-r-md btn-primary px-2 py-1">Go</Button.Root>
                </div>
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

            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <section
                class="file-drop-target p-4"
                data-drag-active={dragActive}
                ondragover={handleDragOver}
                ondrop={handlePatchFileDrop}
                ondragleavecapture={handleDragLeave}
            >
                <h3 class="mb-2 flex items-center gap-1 text-lg font-semibold">
                    <span class="iconify size-6 shrink-0 octicon--file-directory-open-fill-24"></span>
                    From Files
                </h3>

                <FileInput class="mb-2 flex w-fit items-center gap-2 rounded-md btn-primary px-2 py-1" onChange={handlePatchFile}>
                    <span class="iconify size-4 shrink-0 octicon--file-diff-16"></span>
                    Load Patch File
                </FileInput>

                <section class="mb-2">
                    <h4 class="mb-2 font-semibold">Compare Files</h4>
                    <div class="flex flex-wrap items-center gap-1">
                        <SingleFileSelect bind:file={fileA} placeholder="File A" />
                        <span class="iconify size-4 shrink-0 octicon--arrow-right-16"></span>
                        <SingleFileSelect bind:file={fileB} placeholder="File B" />
                        <Button.Root onclick={compareFiles} class="rounded-md btn-primary px-2 py-1">Go</Button.Root>
                    </div>
                </section>

                <section>
                    <div class="mb-2 flex items-center">
                        <h4 class="me-1 font-semibold">Compare Directories</h4>
                        <InfoPopup>
                            Compares the entire contents of the directories, including subdirectories. Does not attempt to detect renames. When possible,
                            preparing a unified diff (<code class="rounded-sm bg-neutral-2 px-1 py-0.5">.patch</code> file) using Git or another tool and loading
                            it with the above button should be preferred.
                        </InfoPopup>
                    </div>
                    <div class="flex flex-wrap items-center gap-1">
                        <DirectorySelect bind:directory={dirA} placeholder="Directory A" />
                        <span class="iconify size-4 shrink-0 octicon--arrow-right-16"></span>
                        <DirectorySelect bind:directory={dirB} placeholder="Directory B" />
                        <div class="flex">
                            <Button.Root onclick={compareDirs} class="relative rounded-l-md btn-primary">
                                <div class="px-2 py-1">Go</div>
                                <div class="absolute top-0 right-0 h-full w-px bg-neutral-3/20"></div>
                            </Button.Root>
                            <Popover.Root>
                                <Popover.Trigger title="Edit filters" class="flex rounded-r-md btn-primary p-2 data-[state=open]:btn-primary-hover">
                                    <span class="iconify size-4 shrink-0 place-self-center octicon--filter-16" aria-hidden="true"></span>
                                </Popover.Trigger>
                                <Popover.Portal>
                                    <Popover.Content side="top" class="z-50 overflow-hidden rounded-md border bg-neutral">
                                        {@render blacklistPopoverContent()}
                                    </Popover.Content>
                                </Popover.Portal>
                            </Popover.Root>
                        </div>
                    </div>
                </section>
            </section>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

<style>
    .file-drop-target {
        position: relative;
    }
    .file-drop-target[data-drag-active="true"]::before {
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
        display: flex;
        align-items: center;
        justify-content: center;

        content: "Drop patch file here";
        font-size: var(--text-3xl);
        color: var(--color-black);

        background-color: rgba(255, 255, 255, 0.7);

        border: dashed var(--color-primary);
        border-radius: inherit;
    }
</style>

<script lang="ts">
    import { type FileStatus, getGithubUsername, GITHUB_URL_PARAM, installGithubApp, loginWithGithub, logoutGithub } from "$lib/github.svelte";
    import { Button, Dialog, Separator, Popover } from "bits-ui";
    import InfoPopup from "$lib/components/InfoPopup.svelte";
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
    import { makeImageDetails, makeTextDetails, MultiFileDiffViewerState } from "$lib/diff-viewer-multi-file.svelte";
    import { binaryFileDummyDetails, bytesEqual, isBinaryFile, isImageFile, parseMultiFilePatch } from "$lib/util";
    import { onMount } from "svelte";
    import { createTwoFilesPatch } from "diff";
    import DirectorySelect from "$lib/components/files/DirectorySelect.svelte";
    import { DirectoryEntry, FileEntry, MultimodalFileInputState, type MultimodalFileInputValueMetadata } from "$lib/components/files/index.svelte";
    import { SvelteSet } from "svelte/reactivity";
    import MultimodalFileInput from "$lib/components/files/MultimodalFileInput.svelte";
    import { flip } from "svelte/animate";

    const viewer = MultiFileDiffViewerState.get();
    let modalOpen = $state(false);

    let githubUrl = $state("https://github.com/");

    let patchFile = $state<MultimodalFileInputState | undefined>();

    let fileOne = $state<MultimodalFileInputState | undefined>();
    let fileTwo = $state<MultimodalFileInputState | undefined>();
    let flipFiles = $state(["1", "arrow", "2"]);

    let dirOne = $state<DirectoryEntry | undefined>();
    let dirTwo = $state<DirectoryEntry | undefined>();
    let flipDirs = $state(["1", "arrow", "2"]);
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
        const fileA = flipFiles[0] === "1" ? fileOne : fileTwo;
        const fileB = flipFiles[0] === "1" ? fileTwo : fileOne;
        if (!fileA || !fileB || !fileA.metadata || !fileB.metadata) {
            alert("Both files must be selected to compare.");
            return;
        }
        const fileAMeta = fileA.metadata;
        const fileBMeta = fileB.metadata;
        modalOpen = false;
        const success = await viewer.loadPatches(
            async () => {
                return { type: "file", fileName: `${fileAMeta.name}...${fileBMeta.name}.patch` };
            },
            async () => {
                const isImageDiff = isImageFile(fileAMeta.name) && isImageFile(fileBMeta.name);
                let blobA: Blob, blobB: Blob;
                try {
                    [blobA, blobB] = await Promise.all([fileA.resolve(), fileB.resolve()]);
                } catch (e) {
                    console.log("Failed to resolve files:", e);
                    throw new Error("Failed to resolve files", { cause: e });
                }
                const [aBinary, bBinary] = await Promise.all([isBinaryFile(blobA), isBinaryFile(blobB)]);
                if (aBinary || bBinary) {
                    if (!isImageDiff) {
                        throw new Error("Cannot compare binary files (except image-to-image comparisons).");
                    }
                }
                if (isImageDiff) {
                    return generateSingleImagePatch(fileAMeta, fileBMeta, blobA, blobB);
                } else {
                    return generateSingleTextPatch(fileAMeta, fileBMeta, blobA, blobB);
                }
            },
        );
        if (!success) {
            modalOpen = true;
            return;
        }
        await updateUrlParams();
    }

    async function* generateSingleImagePatch(
        fileAMeta: MultimodalFileInputValueMetadata,
        fileBMeta: MultimodalFileInputValueMetadata,
        blobA: Blob,
        blobB: Blob,
    ) {
        if (await bytesEqual(blobA, blobB)) {
            alert("The files are identical.");
            return;
        }

        let status: FileStatus = "modified";
        if (fileAMeta.name !== fileBMeta.name) {
            status = "renamed_modified";
        }

        const img = makeImageDetails(fileAMeta.name, fileBMeta.name, status, blobA, blobB);
        img.image.load = true; // load images by default when comparing two files directly
        yield img;
    }

    async function* generateSingleTextPatch(
        fileAMeta: MultimodalFileInputValueMetadata,
        fileBMeta: MultimodalFileInputValueMetadata,
        blobA: Blob,
        blobB: Blob,
    ) {
        const [textA, textB] = await Promise.all([blobA.text(), blobB.text()]);
        if (textA === textB) {
            alert("The files are identical.");
            return;
        }

        const diff = createTwoFilesPatch(fileAMeta.name, fileBMeta.name, textA, textB);
        let status: FileStatus = "modified";
        if (fileAMeta.name !== fileBMeta.name) {
            status = "renamed_modified";
        }

        yield makeTextDetails(fileAMeta.name, fileBMeta.name, status, diff);
    }

    type ProtoFileDetails = {
        path: string;
        file: File;
    };

    async function compareDirs() {
        const dirA = flipDirs[0] === "1" ? dirOne : dirTwo;
        const dirB = flipDirs[0] === "1" ? dirTwo : dirOne;
        if (!dirA || !dirB) {
            alert("Both directories must be selected to compare.");
            return;
        }
        modalOpen = false;
        const success = await viewer.loadPatches(
            async () => {
                return { type: "file", fileName: `${dirA.fileName}...${dirB.fileName}.patch` };
            },
            async () => {
                return generateDirPatches(dirA, dirB);
            },
        );
        if (!success) {
            modalOpen = true;
            return;
        }
        await updateUrlParams();
    }

    async function* generateDirPatches(dirA: DirectoryEntry, dirB: DirectoryEntry) {
        const blacklist = (entry: ProtoFileDetails) => {
            return !dirBlacklistRegexes.some((pattern) => pattern.test(entry.path));
        };
        const entriesA: ProtoFileDetails[] = flatten(dirA).filter(blacklist);
        const entriesAMap = new Map(entriesA.map((entry) => [entry.path, entry]));
        const entriesB: ProtoFileDetails[] = flatten(dirB).filter(blacklist);
        const entriesBMap = new Map(entriesB.map((entry) => [entry.path, entry]));

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
                        yield makeImageDetails(entry.path, entryB.path, "modified", entry.file, entryB.file);
                    } else {
                        yield binaryFileDummyDetails(entry.path, entryB.path, "modified");
                    }
                } else {
                    const [textA, textB] = await Promise.all([entry.file.text(), entryB.file.text()]);
                    if (textA === textB) {
                        // Files are identical
                        continue;
                    }
                    yield makeTextDetails(entry.path, entryB.path, "modified", createTwoFilesPatch(entry.path, entryB.path, textA, textB));
                }
            } else if (isImageFile(entry.file.name)) {
                // Image file removed
                yield makeImageDetails(entry.path, entry.path, "removed", entry.file, entry.file);
            } else if (await isBinaryFile(entry.file)) {
                // Binary file removed
                yield binaryFileDummyDetails(entry.path, entry.path, "removed");
            } else {
                // Text file removed
                yield makeTextDetails(entry.path, entry.path, "removed", createTwoFilesPatch(entry.path, "", await entry.file.text(), ""));
            }
        }

        // Check for added files
        for (const entry of entriesB) {
            const entryA = entriesAMap.get(entry.path);
            if (!entryA) {
                if (isImageFile(entry.file.name)) {
                    yield makeImageDetails(entry.path, entry.path, "added", entry.file, entry.file);
                } else if (await isBinaryFile(entry.file)) {
                    yield binaryFileDummyDetails(entry.path, entry.path, "added");
                } else {
                    yield makeTextDetails(entry.path, entry.path, "added", createTwoFilesPatch("", entry.path, "", await entry.file.text()));
                }
            }
        }
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
        const meta = patchFile.metadata;
        let text: string;
        try {
            const blob = await patchFile.resolve();
            text = await blob.text();
        } catch (e) {
            console.error("Failed to resolve patch file:", e);
            alert("Failed to resolve patch file: " + e);
            return;
        }
        modalOpen = false;
        const success = await viewer.loadPatches(
            async () => {
                return { type: "file", fileName: meta.name };
            },
            async () => {
                return parseMultiFilePatch(text, viewer.loadingState);
            },
        );
        if (!success) {
            modalOpen = true;
            return;
        }
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
                    Sign in to GitHub for higher rate limits and private repository access. Only private repositories configured for the GitHub app will be
                    accessible.
                </InfoPopup>
            {/if}
        </div>

        <div class="flex flex-row gap-1">
            <Button.Root class="flex w-fit flex-row items-center gap-2 rounded-md btn-primary px-2 py-1" onclick={installGithubApp}>
                <span class="iconify shrink-0 octicon--gear-16"></span>
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
            handlePatchFile();
        }}
    >
        <h3 class="mb-4 flex items-center gap-1 text-lg font-semibold">
            <span class="iconify size-6 shrink-0 octicon--file-diff-24"></span>
            From Patch File
        </h3>
        <MultimodalFileInput bind:state={patchFile} required fileTypeOverride={false} defaultMode="file" label="Patch File" />
        <Button.Root type="submit" class="mt-2 rounded-md btn-primary px-2 py-1">Go</Button.Root>
    </form>
{/snippet}

{#snippet filesSection()}
    <form
        class="p-4"
        onsubmit={(e) => {
            e.preventDefault();
            compareFiles();
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
            {#each flipFiles as id, index (id)}
                <div animate:flip={{ duration: 250 }}>
                    {#if id === "1"}
                        <MultimodalFileInput bind:state={fileOne} required label={index === 0 ? "File A" : "File B"} />
                    {:else if id === "arrow"}
                        <div class="flex w-full">
                            <span class="iconify size-4 shrink-0 octicon--arrow-down-16"></span>
                        </div>
                    {:else if id === "2"}
                        <MultimodalFileInput bind:state={fileTwo} required label={index === 2 ? "File B" : "File A"} />
                    {/if}
                </div>
            {/each}
        </div>
        <div class="flex items-center gap-1">
            <Button.Root type="submit" class="rounded-md btn-primary px-2 py-1">Go</Button.Root>
            <Button.Root
                title="Swap File A and File B"
                type="button"
                class="flex size-6 items-center justify-center rounded-md btn-primary"
                onclick={() => {
                    const a = flipFiles[0];
                    flipFiles[0] = flipFiles[2];
                    flipFiles[2] = a;
                }}
            >
                <span class="iconify size-4 shrink-0 octicon--arrow-switch-16" aria-hidden="true"></span>
            </Button.Root>
        </div>
    </form>
{/snippet}

{#snippet directoriesSection()}
    <form
        class="p-4"
        onsubmit={(e) => {
            e.preventDefault();
            compareDirs();
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
            {#each flipDirs as id, index (id)}
                <div animate:flip={{ duration: 250 }} class="flex">
                    {#if id === "1"}
                        <DirectorySelect bind:directory={dirOne} placeholder={index === 0 ? "Directory A" : "Directory B"} />
                    {:else if id === "arrow"}
                        <span class="iconify size-4 shrink-0 octicon--arrow-down-16"></span>
                    {:else if id === "2"}
                        <DirectorySelect bind:directory={dirTwo} placeholder={index === 2 ? "Directory B" : "Directory A"} />
                    {/if}
                </div>
            {/each}
        </div>
        <div class="flex items-center gap-1">
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
            <Button.Root
                title="Swap Directory A and Directory B"
                type="button"
                class="flex size-6 items-center justify-center rounded-md btn-primary"
                onclick={() => {
                    const a = flipDirs[0];
                    flipDirs[0] = flipDirs[2];
                    flipDirs[2] = a;
                }}
            >
                <span class="iconify size-4 shrink-0 octicon--arrow-switch-16" aria-hidden="true"></span>
            </Button.Root>
        </div>
    </form>
{/snippet}

<Dialog.Root bind:open={modalOpen}>
    <Dialog.Trigger class="h-fit rounded-md btn-primary px-2 py-0.5">Open new diff</Dialog.Trigger>
    <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 dark:bg-white/20" />
        <Dialog.Content
            class="fixed top-1/2 left-1/2 z-50 flex max-h-svh w-192 max-w-full -translate-x-1/2 -translate-y-1/2 flex-col rounded-md bg-neutral shadow-md sm:max-w-[95%]"
        >
            <header class="flex shrink-0 flex-row items-center justify-between rounded-t-md bg-neutral-2 p-4">
                <Dialog.Title class="text-xl font-semibold">Open New Diff</Dialog.Title>
                <Dialog.Close title="Close dialog" class="flex size-6 items-center justify-center rounded-md btn-ghost text-primary">
                    <span class="iconify octicon--x-16" aria-hidden="true"></span>
                </Dialog.Close>
            </header>

            <div class="grow overflow-y-auto">
                {@render filesSection()}
                <Separator.Root class="h-px w-full bg-neutral-2" />
                {@render githubSection()}
                <Separator.Root class="h-px w-full bg-neutral-2" />
                {@render directoriesSection()}
                <Separator.Root class="h-px w-full bg-neutral-2" />
                {@render patchSection()}
            </div>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>

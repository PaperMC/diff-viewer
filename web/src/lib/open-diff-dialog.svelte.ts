import type { WritableBoxedValues } from "svelte-toolbelt";
import { DirectoryEntry, FileEntry, MultimodalFileInputState, type MultimodalFileInputValueMetadata } from "./components/files/index.svelte";
import { SvelteSet } from "svelte/reactivity";
import { type FileStatus } from "$lib/github.svelte";
import { makeImageDetails, makeTextDetails, MultiFileDiffViewerState, type LoadPatchesOptions } from "$lib/diff-viewer.svelte";
import { binaryFileDummyDetails, bytesEqual, isBinaryFile, isImageFile, parseMultiFilePatch } from "$lib/util";
import { createTwoFilesPatch } from "diff";

export interface OpenDiffDialogProps {
    open?: boolean;
}

export type OpenDiffDialogStateProps = WritableBoxedValues<{
    open: boolean;
}>;

interface ProtoFileDetails {
    path: string;
    file: File;
}

export class OpenDiffDialogState {
    private readonly props: OpenDiffDialogStateProps;
    private readonly viewer: MultiFileDiffViewerState;

    githubUrl = $state("https://github.com/");

    patchFile = $state(MultimodalFileInputState.createInstance());

    fileOne = $state<MultimodalFileInputState | undefined>();
    fileTwo = $state<MultimodalFileInputState | undefined>();
    flipFiles = $state(["1", "arrow", "2"]);

    dirOne = $state<DirectoryEntry | undefined>();
    dirTwo = $state<DirectoryEntry | undefined>();
    flipDirs = $state(["1", "arrow", "2"]);
    dirBlacklistInput = $state<string>("");
    static readonly DEFAULT_DIR_BLACKLIST = [".git/"];
    dirBlacklist = new SvelteSet(OpenDiffDialogState.DEFAULT_DIR_BLACKLIST);
    dirBlacklistRegexes = $derived.by(() => {
        return Array.from(this.dirBlacklist).map((pattern) => new RegExp(pattern));
    });

    constructor(props: OpenDiffDialogStateProps) {
        this.props = props;
        this.viewer = MultiFileDiffViewerState.get();
    }

    addBlacklistEntry() {
        if (this.dirBlacklistInput === "") {
            return;
        }
        try {
            new RegExp(this.dirBlacklistInput); // Validate regex
        } catch (e) {
            alert("'" + this.dirBlacklistInput + "' is not a valid regex pattern. Error: " + e);
            return;
        }
        this.dirBlacklist.add(this.dirBlacklistInput);
        this.dirBlacklistInput = "";
    }

    resetBlacklist() {
        this.dirBlacklist.clear();
        OpenDiffDialogState.DEFAULT_DIR_BLACKLIST.forEach((pattern) => this.dirBlacklist.add(pattern));
    }

    async compareFiles() {
        const fileA = this.flipFiles[0] === "1" ? this.fileOne : this.fileTwo;
        const fileB = this.flipFiles[0] === "1" ? this.fileTwo : this.fileOne;
        if (!fileA || !fileB || !fileA.metadata || !fileB.metadata) {
            alert("Both files must be selected to compare.");
            return;
        }
        const fileAMeta = fileA.metadata;
        const fileBMeta = fileB.metadata;
        this.props.open.current = false;
        const success = await this.viewer.loadPatches(
            async () => {
                return { linkable: false, type: "file", fileName: `${fileAMeta.name}...${fileBMeta.name}.patch` };
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
                    return this.generateSingleImagePatch(fileAMeta, fileBMeta, blobA, blobB);
                } else {
                    return this.generateSingleTextPatch(fileAMeta, fileBMeta, blobA, blobB);
                }
            },
        );
        if (!success) {
            this.props.open.current = true;
            return;
        }
    }

    async *generateSingleImagePatch(fileAMeta: MultimodalFileInputValueMetadata, fileBMeta: MultimodalFileInputValueMetadata, blobA: Blob, blobB: Blob) {
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

    async *generateSingleTextPatch(fileAMeta: MultimodalFileInputValueMetadata, fileBMeta: MultimodalFileInputValueMetadata, blobA: Blob, blobB: Blob) {
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

    async compareDirs() {
        const dirA = this.flipDirs[0] === "1" ? this.dirOne : this.dirTwo;
        const dirB = this.flipDirs[0] === "1" ? this.dirTwo : this.dirOne;
        if (!dirA || !dirB) {
            alert("Both directories must be selected to compare.");
            return;
        }
        this.props.open.current = false;
        const success = await this.viewer.loadPatches(
            async () => {
                return { linkable: false, type: "file", fileName: `${dirA.fileName}...${dirB.fileName}.patch` };
            },
            async () => {
                return this.generateDirPatches(dirA, dirB);
            },
        );
        if (!success) {
            this.props.open.current = true;
            return;
        }
    }

    async *generateDirPatches(dirA: DirectoryEntry, dirB: DirectoryEntry) {
        const blacklist = (entry: ProtoFileDetails) => {
            return !this.dirBlacklistRegexes.some((pattern) => pattern.test(entry.path));
        };
        const entriesA: ProtoFileDetails[] = this.flatten(dirA).filter(blacklist);
        const entriesAMap = new Map(entriesA.map((entry) => [entry.path, entry]));
        const entriesB: ProtoFileDetails[] = this.flatten(dirB).filter(blacklist);
        const entriesBMap = new Map(entriesB.map((entry) => [entry.path, entry]));

        this.viewer.loadingState.totalCount = new Set([...entriesAMap.keys(), ...entriesBMap.keys()]).size;

        for (const entry of entriesA) {
            const entryB = entriesBMap.get(entry.path);
            if (entryB) {
                // File exists in both directories
                const [aBinary, bBinary] = await Promise.all([isBinaryFile(entry.file), isBinaryFile(entryB.file)]);

                if (aBinary || bBinary) {
                    if (await bytesEqual(entry.file, entryB.file)) {
                        // Files are identical
                        this.viewer.loadingState.loadedCount++;
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
                        this.viewer.loadingState.loadedCount++;
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

    flatten(dir: DirectoryEntry): ProtoFileDetails[] {
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

    async handlePatchFile(opts?: LoadPatchesOptions) {
        if (!this.patchFile || !this.patchFile.metadata) {
            alert("No patch file selected.");
            return;
        }
        const meta = this.patchFile.metadata;
        let text: string;
        try {
            const blob = await this.patchFile.resolve();
            text = await blob.text();
        } catch (e) {
            console.error("Failed to resolve patch file:", e);
            alert("Failed to resolve patch file: " + e);
            return;
        }
        this.props.open.current = false;
        const success = await this.viewer.loadPatches(
            async () => {
                return {
                    linkable: this.patchFile.mode === "url",
                    type: "file",
                    fileName: meta.name,
                    url: this.patchFile.mode === "url" ? this.patchFile.url : undefined,
                };
            },
            async () => {
                return parseMultiFilePatch(text, this.viewer.loadingState);
            },
            opts,
        );
        if (!success) {
            this.props.open.current = true;
            return;
        }
    }

    async handleGithubUrl(opts?: LoadPatchesOptions) {
        const url = new URL(this.githubUrl);
        // exclude hash + query params
        const test = url.protocol + "//" + url.hostname + url.pathname;

        const regex = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(commit|pull|compare)\/(.+)/;
        const match = test.match(regex);

        if (!match) {
            alert("Invalid GitHub URL. Use: https://github.com/owner/repo/(commit|pull|compare)/(id|ref_a...ref_b)");
            return;
        }

        this.githubUrl = match[0];
        this.props.open.current = false;
        const success = await this.viewer.loadFromGithubApi(match, opts);
        if (success) {
            return;
        }
        this.props.open.current = true;
    }
}

import { type ReadableBoxedValues } from "svelte-toolbelt";
import { lazyPromise } from "$lib/util";

export interface FileSystemEntry {
    fileName: string;
}

export class DirectoryEntry implements FileSystemEntry {
    fileName: string;
    children: FileSystemEntry[];

    constructor(fileName: string, children: FileSystemEntry[]) {
        this.fileName = fileName;
        this.children = children;
    }
}

export class FileEntry implements FileSystemEntry {
    fileName: string;
    file: File;

    constructor(fileName: string, file: File) {
        this.fileName = fileName;
        this.file = file;
    }
}

export async function pickDirectory(): Promise<DirectoryEntry> {
    if (!window.showDirectoryPicker) {
        return await pickDirectoryLegacy();
    }

    const directoryHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker();

    if (!directoryHandle.entries) {
        return await pickDirectoryLegacy();
    }

    return await handleToDirectoryEntry(directoryHandle);
}

async function handleToDirectoryEntry(directoryHandle: FileSystemDirectoryHandle): Promise<DirectoryEntry> {
    const root = new DirectoryEntry(directoryHandle.name, []);

    type StackEntry = [FileSystemDirectoryHandle, DirectoryEntry];
    const stack: StackEntry[] = [[directoryHandle, root]];

    while (stack.length > 0) {
        const [dirHandle, dirEntry] = stack.shift()!;

        for await (const [, handle] of dirHandle.entries()) {
            if (handle.kind === "directory") {
                const subDir = new DirectoryEntry(handle.name, []);
                dirEntry.children.push(subDir);
                stack.push([handle, subDir]);
            } else if (handle.kind === "file") {
                dirEntry.children.push(await handleToFileEntry(handle));
            }
        }
    }

    return root;
}

async function handleToFileEntry(fileHandle: FileSystemFileHandle): Promise<FileEntry> {
    const file = await fileHandle.getFile();
    return new FileEntry(fileHandle.name, file);
}

async function pickDirectoryLegacy(): Promise<DirectoryEntry> {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.multiple = true;

    return new Promise((resolve, reject) => {
        input.addEventListener("change", (event) => {
            const files = (event.target as HTMLInputElement).files;
            if (!files) {
                reject(new Error("No files selected"));
                return;
            }

            resolve(filesToDirectory(files));
        });

        input.click();
    });
}

function filesToDirectory(files: FileList): DirectoryEntry {
    let ret: DirectoryEntry | null = null;

    for (const file of files) {
        const parts = file.webkitRelativePath.split("/");

        if (parts.length === 1) {
            throw Error("File has no path");
        }

        let current: DirectoryEntry | null = null;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];

            if (current === null) {
                current = ret;
                if (current === null) {
                    current = new DirectoryEntry(part, []);
                    ret = current;
                }
                continue;
            }

            if (i === parts.length - 1) {
                current.children.push(new FileEntry(part, file));
            } else {
                let dirEntry = current.children.find((entry) => entry.fileName === part) as DirectoryEntry;
                if (!dirEntry) {
                    dirEntry = new DirectoryEntry(part, []);
                    current.children.push(dirEntry);
                }
                current = dirEntry;
            }
        }
    }

    if (ret === null) {
        throw Error("Selected empty directory");
    }

    return ret;
}

export type FileInputMode = "file" | "url" | "text";

export type MultimodalFileInputValueMetadata = {
    type: FileInputMode;
    name: string;
};

export type MultimodalFileInputProps = {
    state?: MultimodalFileInputState | undefined;

    label?: string | undefined;
    required?: boolean | undefined;
};

export type MultimodalFileInputStateProps = {
    state: MultimodalFileInputState | undefined;
} & ReadableBoxedValues<{
    label: string;
    required: boolean;
}>;

export class MultimodalFileInputState {
    private readonly opts: MultimodalFileInputStateProps;
    mode: FileInputMode = $state("file");
    text: string = $state("");
    file: File | undefined = $state(undefined);
    url: string = $state("");
    private urlResolver = $derived.by(() => {
        const url = this.url;
        return lazyPromise(async () => {
            let threw = false;
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    threw = true;
                    throw new Error(`Failed to fetch from URL: ${url}\nStatus: ${response.status}\nBody:\n${await response.text()}`);
                }
                return await response.blob();
            } catch (e) {
                if (threw) {
                    throw e;
                }
                throw new Error(`Failed to fetch from URL: ${url}\nSome errors, such as those caused by CORS, will only print in the console.\nCause: ${e}`);
            }
        });
    });
    dragActive = $state(false);

    constructor(opts: MultimodalFileInputStateProps) {
        this.opts = opts;
        if (this.opts.state) {
            this.mode = this.opts.state.mode;
            this.text = this.opts.state.text;
            this.file = this.opts.state.file;
            this.url = this.opts.state.url;
            this.urlResolver = this.opts.state.urlResolver;
        }
    }

    get metadata(): MultimodalFileInputValueMetadata | null {
        const mode = this.mode;
        const label = this.opts.label.current;
        if (mode === "file" && this.file !== undefined) {
            const file = this.file;
            return { type: "file", name: file.name };
        } else if (mode === "url" && this.url !== "") {
            return { type: "url", name: this.url };
        } else if (mode === "text" && this.text !== "") {
            return { type: "text", name: `${label} (Text Input)` };
        } else {
            return null;
        }
    }

    async resolve(): Promise<Blob> {
        const mode = this.mode;
        if (mode === "file" && this.file !== undefined) {
            return this.file;
        } else if (mode === "url" && this.url !== "") {
            return this.urlResolver.getValue();
        } else if (mode === "text" && this.text !== "") {
            return new Blob([this.text], { type: "text/plain" });
        } else {
            throw Error("No value present");
        }
    }

    reset() {
        this.text = "";
        this.file = undefined;
        this.url = "";
    }

    swapState(other: MultimodalFileInputState) {
        const mode = this.mode;
        const text = this.text;
        const file = this.file;
        const url = this.url;
        const urlResolver = this.urlResolver;

        this.mode = other.mode;
        this.text = other.text;
        this.file = other.file;
        this.url = other.url;
        this.urlResolver = other.urlResolver;

        other.mode = mode;
        other.text = text;
        other.file = file;
        other.url = url;
        other.urlResolver = urlResolver;
    }
}

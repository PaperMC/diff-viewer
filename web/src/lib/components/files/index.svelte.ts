import { type ReadableBoxedValues } from "svelte-toolbelt";
import { getExtensionForLanguage, lazyPromise } from "$lib/util";
import type { BundledLanguage, SpecialLanguage } from "shiki";

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

export type FileType = SpecialLanguage | BundledLanguage | "auto";

export type FileInputMode = "file" | "url" | "text";

export type MultimodalFileInputValueMetadata = {
    type: FileInputMode;
    name: string;
};

export type MultimodalFileInputProps = {
    state?: MultimodalFileInputState | undefined;

    label?: string | undefined;
    required?: boolean | undefined;
    fileTypeOverride?: boolean | undefined;
    defaultMode?: FileInputMode | undefined;
};

export type MultimodalFileInputStateProps = {
    state: MultimodalFileInputState | undefined;
} & ReadableBoxedValues<{
    label: string;
    required: boolean;
    fileTypeOverride: boolean;
    defaultMode: FileInputMode;
}>;

export class MultimodalFileInputState {
    private readonly opts: MultimodalFileInputStateProps;
    mode: FileInputMode = $state("text");
    text: string = $state("");
    textType: FileType = $state("plaintext");
    file: File | undefined = $state(undefined);
    fileType: FileType = $state("auto");
    url: string = $state("");
    urlType: FileType = $state("auto");
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
            this.textType = this.opts.state.textType;
            this.file = this.opts.state.file;
            this.fileType = this.opts.state.fileType;
            this.url = this.opts.state.url;
            this.urlType = this.opts.state.urlType;
            this.urlResolver = this.opts.state.urlResolver;
        } else {
            this.mode = this.opts.defaultMode.current ?? "text";
        }
    }

    getFileType(): FileType {
        const mode = this.mode;
        if (mode === "file") {
            return this.fileType;
        } else if (mode === "url") {
            return this.urlType;
        } else if (mode === "text") {
            return this.textType;
        }
        throw new Error("Invalid mode");
    }

    setFileType(fileType: FileType) {
        const mode = this.mode;
        if (mode === "file") {
            this.fileType = fileType;
        } else if (mode === "url") {
            this.urlType = fileType;
        } else if (mode === "text") {
            this.textType = fileType;
        } else {
            throw new Error("Invalid mode");
        }
    }

    private getExtensionOrBlank() {
        const fileType = this.getFileType();
        if (fileType === "auto") {
            return "";
        }
        return getExtensionForLanguage(fileType);
    }

    get metadata(): MultimodalFileInputValueMetadata | null {
        const mode = this.mode;
        const label = this.opts.label.current;
        if (mode === "file" && this.file !== undefined) {
            const file = this.file;
            return { type: "file", name: `${file.name}${this.getExtensionOrBlank()}` };
        } else if (mode === "url" && this.url !== "") {
            return { type: "url", name: `${this.url}${this.getExtensionOrBlank()}` };
        } else if (mode === "text" && this.text !== "") {
            return { type: "text", name: `${label}${this.getExtensionOrBlank()}` };
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
}

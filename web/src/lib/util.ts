import { type FileDetails, type ImageFileDetails, LoadingState, makeTextDetails } from "./diff-viewer.svelte";
import type { FileStatus } from "./github.svelte";
import type { TreeNode } from "$lib/components/tree/index.svelte";
import type { BundledLanguage, SpecialLanguage } from "shiki";
import { onMount } from "svelte";
import { on } from "svelte/events";
import { type Attachment } from "svelte/attachments";

export type Getter<T> = () => T;

export type MutableValue<T> = {
    value: T;
};

export function clearCookie(name: string) {
    document.cookie = name + "=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

export function setCookie(name: string, value: string) {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

function isFullCommitHash(s: string): boolean {
    return /^[0-9a-fA-F]{40}$/.test(s);
}

export function trimCommitHash(hash: string): string {
    if (isFullCommitHash(hash)) {
        return hash.substring(0, 8);
    }
    return hash;
}

export async function isBinaryFile(file: Blob): Promise<boolean> {
    const sampleSize = Math.min(file.size, 1024);
    const buffer = await file.slice(0, sampleSize).arrayBuffer();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    try {
        decoder.decode(buffer);
        return false; // Valid UTF-8, likely text
    } catch {
        return true; // Invalid UTF-8, likely binary
    }
}

export async function bytesEqual(
    a: Blob,
    b: Blob,
    chunkingThreshold: number = 4 * 1024 * 1024, // 4MB
    chunkSize: number = chunkingThreshold,
): Promise<boolean> {
    if (a.size !== b.size) {
        return false;
    }
    if (a.size === 0) {
        return true;
    }

    if (a.size <= chunkingThreshold) {
        // Process small files in one go
        const [bytesA, bytesB] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
        if (bytesA.byteLength === bytesB.byteLength) {
            const viewA = new Uint8Array(bytesA);
            const viewB = new Uint8Array(bytesB);
            return viewA.every((byte, index) => byte === viewB[index]);
        }
        return false;
    }

    // Process large files in chunks
    for (let offset = 0; offset < a.size; offset += chunkSize) {
        const sliceA = a.slice(offset, offset + chunkSize);
        const sliceB = b.slice(offset, offset + chunkSize);
        const [bytesA, bytesB] = await Promise.all([sliceA.arrayBuffer(), sliceB.arrayBuffer()]);

        if (bytesA.byteLength !== bytesB.byteLength) {
            return false;
        }

        const viewA = new Uint8Array(bytesA);
        const viewB = new Uint8Array(bytesB);
        if (!viewA.every((byte, index) => byte === viewB[index])) {
            return false;
        }
    }

    return true;
}

export function binaryFileDummyDetails(fromFile: string, toFile: string, status: FileStatus): FileDetails {
    let fakeContent: string;
    switch (status) {
        case "added":
            fakeContent = `diff --git a/${toFile} b/${toFile}\n--- /dev/null\n+++ b/${toFile}\n@@ -0,0 +1,1 @@\n+Cannot show binary file`;
            break;
        case "removed":
            fakeContent = `diff --git a/${fromFile} b/${fromFile}\n--- a/${fromFile}\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-Cannot show binary file`;
            break;
        default:
            fakeContent = `diff --git a/${fromFile} b/${toFile}\n--- a/${fromFile}\n+++ b/${toFile}\n@@ -1,1 +1,1 @@\n-Cannot show binary file\n+Cannot show binary file`;
            break;
    }
    return makeTextDetails(fromFile, toFile, status, fakeContent);
}

const fileRegex = /diff --git a\/(\S+) b\/(\S+)\r?\n(?:.+\r?\n)*?(?=-- \r?\n|diff --git|$)/g;

type BasicHeader = {
    fromFile: string;
    toFile: string;
    status: FileStatus;
    binary: boolean;
};

function parseHeader(patch: string, fromFile: string, toFile: string): BasicHeader {
    let status: FileStatus = "modified";
    if (fromFile !== toFile) {
        status = "renamed_modified";
    }
    let binary = false;
    let foundIndex = false;

    let lineStart = 0;
    while (true) {
        const lineEnd = patch.indexOf("\n", lineStart);
        if (lineEnd === -1) {
            break; // No more lines
        }
        const line = patch.substring(lineStart, lineEnd);
        if (line.startsWith("similarity index 100%")) {
            status = "renamed";
            if (isImageFile(fromFile) && isImageFile(toFile)) {
                binary = true; // Treat renamed images as binary
            }
        } else if (line.startsWith("deleted file mode")) {
            status = "removed";
        } else if (line.startsWith("new file mode")) {
            status = "added";
        } else if (line.startsWith("index ")) {
            foundIndex = true;
        } else if (foundIndex) {
            if (line.startsWith("Binary files")) {
                binary = true;
            }
            // end of header
            break;
        }
        lineStart = lineEnd + 1;
    }

    return { fromFile, toFile, status, binary };
}

export function parseMultiFilePatch(
    patchContent: string,
    loadingState: LoadingState,
    imageFactory?: (fromFile: string, toFile: string, status: FileStatus) => ImageFileDetails | null,
): AsyncGenerator<FileDetails> {
    const split = splitMultiFilePatch(patchContent);
    loadingState.totalCount = split.length;
    async function* detailsGenerator() {
        for (const [header, content] of split) {
            if (header.binary) {
                if (imageFactory !== undefined && isImageFile(header.fromFile) && isImageFile(header.toFile)) {
                    const imageDetails = imageFactory(header.fromFile, header.toFile, header.status);
                    if (imageDetails != null) {
                        yield imageDetails;
                        continue;
                    }
                } else {
                    yield binaryFileDummyDetails(header.fromFile, header.toFile, header.status);
                    continue;
                }
            }

            yield makeTextDetails(header.fromFile, header.toFile, header.status, content);
        }
    }
    return detailsGenerator();
}

export function splitMultiFilePatch(patchContent: string): [BasicHeader, string][] {
    const patches: [BasicHeader, string][] = [];
    let fileMatch;
    while ((fileMatch = fileRegex.exec(patchContent)) !== null) {
        const [fullFileMatch, fromFile, toFile] = fileMatch;
        const header = parseHeader(fullFileMatch, fromFile, toFile);
        patches.push([header, fullFileMatch]);
    }
    return patches;
}

export type FileTreeNodeData =
    | {
          type: "file";
          file: FileDetails;
      }
    | {
          type: "directory";
          name: string;
      };

export function makeFileTree(paths: FileDetails[]): TreeNode<FileTreeNodeData>[] {
    if (paths.length === 0) {
        return [];
    }

    const root: TreeNode<FileTreeNodeData> = {
        children: [],
        data: { type: "directory", name: "" },
    };

    for (const details of paths) {
        const parts = details.toFile.split("/");
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const existingChild = current.children.find((child) => child.data.type === "directory" && child.data.name === part);
            if (existingChild) {
                current = existingChild;
            } else {
                const file = i === parts.length - 1;
                const newChild: TreeNode<FileTreeNodeData> = {
                    children: [],
                    data: file
                        ? {
                              type: "file",
                              file: details,
                          }
                        : {
                              type: "directory",
                              name: part,
                          },
                };
                current.children.push(newChild);
                current = newChild;
            }
        }
    }

    function mergeRedundantDirectories(node: TreeNode<FileTreeNodeData>) {
        for (const child of node.children) {
            mergeRedundantDirectories(child);
        }

        if (node.children.length === 1 && node.data.type === "directory" && node.children[0].data.type === "directory") {
            if (node.data.name !== "") {
                node.data.name = `${node.data.name}/${node.children[0].data.name}`;
            } else {
                node.data.name = node.children[0].data.name;
            }
            node.children = node.children[0].children;
        }
    }

    mergeRedundantDirectories(root);

    if (root.data.type === "directory" && root.data.name === "") {
        return root.children;
    }
    return [root];
}

const imageExtensions: Set<string> = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", /*"svg",*/ "tiff", "ico"]);

export function isImageFile(fileName: string | null) {
    if (fileName === null) {
        return false;
    }
    const lastDot = fileName.lastIndexOf(".");
    if (lastDot === -1) {
        return false;
    }
    const extension = fileName.substring(lastDot + 1).toLowerCase();
    return imageExtensions.has(extension);
}

export type LazyPromise<T> = {
    hasValue: () => boolean;
    getValue: () => Promise<T>;
};

export function lazyPromise<T>(fn: () => Promise<T>): LazyPromise<T> {
    let value: T | null = null;
    let pendingValue: Promise<T> | null = null;
    return {
        hasValue: () => pendingValue !== null || value !== null,
        getValue: async () => {
            if (value !== null) {
                return value;
            }
            if (pendingValue !== null) {
                return pendingValue;
            }
            pendingValue = fn();
            value = await pendingValue;
            return value;
        },
    };
}

// Map of extensions to Shiki-supported languages (unique keys only)
const languageMap: { [key: string]: BundledLanguage | SpecialLanguage } = {
    ".abap": "abap",
    ".ada": "ada",
    ".adb": "ada",
    ".ads": "ada",
    ".as": "actionscript-3",
    ".apacheconf": "apache",
    ".applescript": "applescript",
    ".scpt": "applescript",
    ".awk": "awk",
    ".bash": "bash",
    ".sh": "bash", // Common shell extension, prioritizing bash
    ".zsh": "bash",
    ".bat": "bat",
    ".cmd": "bat",
    ".bicep": "bicep",
    ".c": "c",
    ".h": "c",
    ".clj": "clojure",
    ".cljs": "clojure",
    ".cljc": "clojure",
    ".coffee": "coffeescript",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".csx": "csharp",
    ".css": "css",
    ".dart": "dart",
    // ".diff": "diff", // We highlight diffs ourselves
    // ".patch": "diff", // We highlight diffs ourselves
    dockerfile: "docker", // No dot for Dockerfile
    ".docker": "docker",
    ".elm": "elm",
    ".erb": "erb",
    ".ex": "elixir",
    ".exs": "elixir",
    ".fs": "fsharp",
    ".fsi": "fsharp",
    ".fsx": "fsharp",
    ".go": "go",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".groovy": "groovy",
    ".gvy": "groovy",
    ".haml": "haml",
    ".hbs": "handlebars",
    ".handlebars": "handlebars",
    ".hs": "haskell",
    ".lhs": "haskell",
    ".html": "html",
    ".htm": "html",
    ".ini": "ini",
    ".properties": "ini",
    ".java": "java",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".json": "json",
    ".jsonc": "json",
    ".jl": "julia",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".less": "less",
    ".liquid": "liquid",
    ".lua": "lua",
    ".md": "markdown",
    ".markdown": "markdown",
    ".m": "objective-c", // Prioritizing Objective-C over MATLAB for .m
    ".mm": "objective-c",
    ".nginx": "nginx",
    ".nim": "nim",
    ".nix": "nix",
    ".ml": "ocaml",
    ".mli": "ocaml",
    ".pas": "pascal",
    ".p": "pascal",
    ".pl": "perl", // Prioritizing Perl over Prolog for .pl
    ".pm": "perl",
    ".php": "php",
    ".phtml": "php",
    ".txt": "plaintext",
    ".ps1": "powershell",
    ".psm1": "powershell",
    ".prisma": "prisma",
    ".pro": "prolog",
    ".pug": "pug",
    ".jade": "pug",
    ".pp": "puppet",
    ".py": "python",
    ".pyc": "python",
    ".pyo": "python",
    ".r": "r",
    ".rb": "ruby",
    ".rbx": "ruby",
    ".rs": "rust",
    ".sass": "sass",
    ".scss": "scss",
    ".scala": "scala",
    ".sc": "scala",
    ".scheme": "scheme",
    ".scm": "scheme",
    ".ss": "scheme",
    ".svelte": "svelte",
    ".swift": "swift",
    ".tf": "terraform",
    ".hcl": "terraform",
    ".toml": "toml",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".twig": "twig",
    ".vb": "vb",
    ".vbs": "vb",
    ".v": "verilog",
    ".sv": "verilog",
    ".vhdl": "vhdl",
    ".vhd": "vhdl",
    ".vue": "vue",
    ".wgsl": "wgsl",
    ".xml": "xml",
    ".xsd": "xml",
    ".xsl": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
};

const reverseLanguageMap = Object.fromEntries(Object.entries(languageMap).map(([ext, lang]) => [lang, ext]));

export function getExtensionForLanguage(language: BundledLanguage | SpecialLanguage): string {
    return reverseLanguageMap[language] || ".txt";
}

export function guessLanguageFromExtension(fileName: string): BundledLanguage | SpecialLanguage {
    const lowerFileName = fileName.toLowerCase();
    const extensionIndex = lowerFileName.lastIndexOf(".");
    if (extensionIndex === -1) return "text";
    const extension = lowerFileName.slice(extensionIndex);
    return languageMap[extension] || "text";
}

export function capitalizeFirstLetter(val: string): string {
    return val.charAt(0).toUpperCase() + val.slice(1);
}

export function countOccurrences(str: string, substr: string): number {
    let count = 0;
    let idx = 0;
    while (idx > -1) {
        idx = str.indexOf(substr, idx);
        if (idx > -1) {
            count++;
            idx += substr.length;
        }
    }
    return count;
}

// Watches for changes to local storage in other tabs
export function watchLocalStorage(key: string, callback: (newValue: string | null) => void) {
    onMount(() => {
        function storageChanged(event: StorageEvent) {
            if (event.storageArea === localStorage && event.key === key) {
                callback(event.newValue);
            }
        }

        const destroy = on(window, "storage", storageChanged);
        return { destroy };
    });
}

export function resizeObserver(callback: ResizeObserverCallback): Attachment<HTMLElement> {
    return (element) => {
        const observer = new ResizeObserver(callback);
        observer.observe(element);
        return () => {
            observer.disconnect();
        };
    };
}

export function animationFramePromise() {
    return new Promise((resolve) => {
        requestAnimationFrame(resolve);
    });
}

export async function yieldToBrowser() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

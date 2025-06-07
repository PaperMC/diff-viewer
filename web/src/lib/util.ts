import type { FileDetails } from "./diff-viewer-multi-file.svelte";
import type { FileStatus } from "./github.svelte";
import type { TreeNode } from "$lib/components/tree/index.svelte";
import type { BundledLanguage, SpecialLanguage } from "shiki";
import { onMount } from "svelte";
import type { Action } from "svelte/action";
import type { ReadableBox } from "svelte-toolbelt";
import { on } from "svelte/events";

export type Getter<T> = () => T;

export type MutableValue<T> = {
    value: T;
};

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
    return {
        content: fakeContent,
        fromFile: fromFile,
        toFile: toFile,
        status,
    };
}

const fileRegex = /diff --git a\/(\S+) b\/(\S+)\r?\n(?:.+\r?\n)*?(?=diff --git|$)/g;

export function splitMultiFilePatch(patchContent: string): FileDetails[] {
    const patches: FileDetails[] = [];
    // Process each file in the diff
    let fileMatch;
    while ((fileMatch = fileRegex.exec(patchContent)) !== null) {
        const [fullFileMatch, fromFile, toFile] = fileMatch;

        let status: FileStatus = "modified";

        const newlineIndex = fullFileMatch.indexOf("\n");
        if (newlineIndex !== -1) {
            const secondNewlineIndex = fullFileMatch.indexOf("\n", newlineIndex + 1);
            if (secondNewlineIndex !== -1) {
                const line2 = fullFileMatch.substring(newlineIndex + 1, secondNewlineIndex);

                if (fromFile !== toFile) {
                    if (line2 === "similarity index 100%") {
                        status = "renamed";
                    } else {
                        status = "renamed_modified";
                    }
                } else if (line2.match(/^deleted file mode/)) {
                    status = "removed";
                } else if (line2.match(/^new file mode/)) {
                    status = "added";
                }

                const thirdNewlineIndex = fullFileMatch.indexOf("\n", secondNewlineIndex + 1);
                if (thirdNewlineIndex !== -1) {
                    const line3 = fullFileMatch.substring(secondNewlineIndex + 1, thirdNewlineIndex);
                    if (line3.match(/^Binary/)) {
                        patches.push(binaryFileDummyDetails(fromFile, toFile, status));
                        continue;
                    }
                }
            }
        }

        patches.push({ content: fullFileMatch, fromFile: fromFile, toFile: toFile, status });
    }
    return patches;
}

export type FileTreeNodeData = {
    data: FileDetails | string;
    type: "file" | "directory";
};

export function makeFileTree(paths: FileDetails[]): TreeNode<FileTreeNodeData>[] {
    if (paths.length === 0) {
        return [];
    }

    const root: TreeNode<FileTreeNodeData> = {
        children: [],
        data: { type: "directory", data: "" },
    };

    for (const details of paths) {
        const parts = details.toFile.split("/");
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const existingChild = current.children.find((child) => child.data.data === part);
            if (existingChild) {
                current = existingChild;
            } else {
                const file = i === parts.length - 1;
                const data: FileDetails | string = file ? details : part;
                const type = file ? "file" : "directory";
                const newChild: TreeNode<FileTreeNodeData> = {
                    children: [],
                    data: { data, type },
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
            if (node.data.data !== "") {
                node.data.data = `${node.data.data}/${node.children[0].data.data}`;
            } else {
                node.data.data = node.children[0].data.data;
            }
            node.children = node.children[0].children;
        }
    }

    mergeRedundantDirectories(root);

    if (root.data.type === "directory" && root.data.data === "") {
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

export const resizeObserver: Action<HTMLElement, ResizeObserverCallback> = (node, callback) => {
    const observer = new ResizeObserver(callback);
    observer.observe(node);
    return {
        destroy() {
            observer.disconnect();
        },
    };
};

// from bits-ui internals
export type ReadableBoxedValues<T> = {
    [K in keyof T]: ReadableBox<T[K]>;
};

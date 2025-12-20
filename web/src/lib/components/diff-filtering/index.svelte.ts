import type { FileDetails } from "$lib/diff-viewer.svelte";
import { FILE_STATUSES } from "$lib/github.svelte";
import { SvelteSet } from "svelte/reactivity";

export type FilePathFilterMode = "include" | "exclude";
export class FilePathFilter {
    text: string;
    regex: RegExp;
    mode: FilePathFilterMode;

    constructor(text: string, regex: RegExp, mode: FilePathFilterMode) {
        this.text = $state(text);
        this.regex = $state.raw(regex);
        this.mode = $state(mode);
    }
}

function tryCompileRegex(pattern: string): RegExp | undefined {
    try {
        return new RegExp(pattern);
    } catch {
        return undefined;
    }
}

export class DiffFilterDialogState {
    filePathFilters = new SvelteSet<FilePathFilter>();
    reverseFilePathFilters = $derived([...this.filePathFilters].toReversed());
    filePathInclusions = $derived(this.reverseFilePathFilters.filter((f) => f.mode === "include"));
    filePathExclusions = $derived(this.reverseFilePathFilters.filter((f) => f.mode === "exclude"));

    selectedFileStatuses: string[] = $state([...FILE_STATUSES]);

    addFilePathFilter(filterString: string, mode: FilePathFilterMode): { invalidRegex: boolean } {
        const compiled = tryCompileRegex(filterString);
        if (!compiled) {
            return { invalidRegex: true };
        }
        const newFilter = new FilePathFilter(filterString, compiled, mode);
        this.filePathFilters.add(newFilter);
        return { invalidRegex: false };
    }

    setDefaults() {
        this.filePathFilters.clear();
        this.selectedFileStatuses = [...FILE_STATUSES];
    }

    filterFile(file: FileDetails): boolean {
        const statusAllowed = this.selectedFileStatuses.includes(file.status);
        if (!statusAllowed) {
            return false;
        }
        for (const exclude of this.filePathExclusions) {
            if (exclude.regex.test(file.toFile) || exclude.regex.test(file.fromFile)) {
                return false;
            }
        }
        if (this.filePathInclusions.length > 0) {
            for (const include of this.filePathInclusions) {
                if (include.regex.test(file.toFile) || include.regex.test(file.fromFile)) {
                    return true;
                }
            }
            return false;
        }
        return true;
    }
}

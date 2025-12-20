import type { FileDetails } from "$lib/diff-viewer.svelte";
import { FILE_STATUSES } from "$lib/github.svelte";
import { SvelteSet } from "svelte/reactivity";

export type FileNameFilterMode = "include" | "exclude";
export class FileNameFilter {
    text: string;
    regex: RegExp;
    mode: FileNameFilterMode;

    constructor(text: string, regex: RegExp, mode: FileNameFilterMode) {
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
    fileNameFilters = new SvelteSet<FileNameFilter>();
    reverseFileNameFilters = $derived([...this.fileNameFilters].toReversed());

    selectedFileStatuses: string[] = $state([...FILE_STATUSES]);

    addFileNameFilter(filterString: string, mode: FileNameFilterMode): { invalidRegex: boolean } {
        const compiled = tryCompileRegex(filterString);
        if (!compiled) {
            return { invalidRegex: true };
        }
        const newFilter = new FileNameFilter(filterString, compiled, mode);
        this.fileNameFilters.add(newFilter);
        return { invalidRegex: false };
    }

    setDefaults() {
        this.fileNameFilters.clear();
        this.selectedFileStatuses = [...FILE_STATUSES];
    }

    filterFile(file: FileDetails): boolean {
        const statusAllowed = this.selectedFileStatuses.includes(file.status);
        if (!statusAllowed) {
            return false;
        }
        const pathFilterArray = [...this.fileNameFilters];
        const includes = pathFilterArray.filter((f) => f.mode === "include");
        const excludes = pathFilterArray.filter((f) => f.mode === "exclude");
        for (const exclude of excludes) {
            if (exclude.regex.test(file.toFile) || exclude.regex.test(file.fromFile)) {
                return false;
            }
        }
        if (includes.length > 0) {
            for (const include of includes) {
                if (include.regex.test(file.toFile) || include.regex.test(file.fromFile)) {
                    return true;
                }
            }
            return false;
        }
        return true;
    }
}

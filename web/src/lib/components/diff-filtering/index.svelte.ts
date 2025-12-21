import type { FileDetails } from "$lib/diff-viewer.svelte";
import { FILE_STATUSES } from "$lib/github.svelte";
import type { TryCompileRegexSuccess } from "$lib/util";
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

export class DiffFilterDialogState {
    filePathFilters = new SvelteSet<FilePathFilter>();
    reverseFilePathFilters = $derived([...this.filePathFilters].toReversed());
    filterFunction = $derived(this.createFilterFunction());

    selectedFileStatuses: string[] = $state([...FILE_STATUSES]);

    addFilePathFilter(regex: TryCompileRegexSuccess, mode: FilePathFilterMode) {
        const newFilter = new FilePathFilter(regex.input, regex.regex, mode);
        this.filePathFilters.add(newFilter);
    }

    setDefaults() {
        this.filePathFilters.clear();
        this.selectedFileStatuses = [...FILE_STATUSES];
    }

    filterFile(file: FileDetails): boolean {
        return this.filterFunction(file);
    }

    private createFilterFunction() {
        const filePathInclusions = this.reverseFilePathFilters.filter((f) => f.mode === "include");
        const filePathExclusions = this.reverseFilePathFilters.filter((f) => f.mode === "exclude");
        const selectedFileStatuses = [...this.selectedFileStatuses];

        return (file: FileDetails) => {
            const statusAllowed = selectedFileStatuses.includes(file.status);
            if (!statusAllowed) {
                return false;
            }
            for (const exclude of filePathExclusions) {
                if (exclude.regex.test(file.toFile) || exclude.regex.test(file.fromFile)) {
                    return false;
                }
            }
            if (filePathInclusions.length > 0) {
                for (const include of filePathInclusions) {
                    if (include.regex.test(file.toFile) || include.regex.test(file.fromFile)) {
                        return true;
                    }
                }
                return false;
            }
            return true;
        };
    }
}

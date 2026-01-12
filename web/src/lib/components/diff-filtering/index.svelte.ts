import type { FileDetails } from "$lib/diff-viewer.svelte";
import { FILE_STATUSES, type FileStatus } from "$lib/github.svelte";
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

export interface DiffFilterDialogProps {
    instance: DiffFilterDialogState;
    mode: "session" | "defaults";
    open: boolean;
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

    serialize(): object | null {
        if (this.filePathFilters.size === 0 && this.selectedFileStatuses.length === FILE_STATUSES.length) {
            return null;
        }
        return {
            filePathFilters: Array.from(this.filePathFilters).map((filter) => ({
                text: filter.text,
                regex: filter.regex.source,
                mode: filter.mode,
            })),
            selectedFileStatuses: this.selectedFileStatuses,
        };
    }

    loadFrom(data: object | undefined | null) {
        if (data === undefined || data === null) {
            this.setDefaults();
            return;
        }

        const parsed = data as {
            filePathFilters?: { text: string; regex: string; mode: FilePathFilterMode }[];
            selectedFileStatuses?: string[];
        };

        this.filePathFilters.clear();
        if (parsed.filePathFilters) {
            for (const filter of parsed.filePathFilters) {
                try {
                    const regex = new RegExp(filter.regex);
                    this.filePathFilters.add(new FilePathFilter(filter.text, regex, filter.mode));
                } catch {
                    continue;
                }
            }
        }

        if (parsed.selectedFileStatuses) {
            const validStatuses = parsed.selectedFileStatuses.filter((status) => FILE_STATUSES.includes(status as FileStatus));
            this.selectedFileStatuses = validStatuses;
        }
    }

    setFrom(other: DiffFilterDialogState) {
        this.filePathFilters.clear();
        for (const filter of other.filePathFilters) {
            this.filePathFilters.add(new FilePathFilter(filter.text, filter.regex, filter.mode));
        }
        this.selectedFileStatuses = [...other.selectedFileStatuses];
    }
}

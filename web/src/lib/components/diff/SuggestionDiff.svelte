<script lang="ts">
    import { getContext } from "svelte";
    import { diffLines, type Change } from "diff";
    import ConciseDiffView from "./ConciseDiffView.svelte";
    import { GlobalOptions } from "$lib/diff-viewer-multi-file.svelte";

    interface Props {
        originalContent: string;
        suggestedContent: string;
        startLine?: number;
    }

    interface DiffSettings {
        syntaxHighlighting: boolean;
        wordDiffs: boolean;
        lineWrap: boolean;
    }

    interface Hunk {
        oldStart: number;
        oldLines: number;
        newStart: number;
        newLines: number;
        lines: string[];
    }

    interface StructuredPatch {
        oldFileName: string;
        newFileName: string;
        oldHeader: string;
        newHeader: string;
        hunks: Hunk[];
    }

    let { originalContent, suggestedContent, startLine = 1 }: Props = $props();

    const diffSettings = getContext<DiffSettings>("diff-settings");
    const globalOptions = GlobalOptions.get();

    function createStructuredPatchFromChanges(oldStr: string, newStr: string, startLineNumber: number): StructuredPatch {
        const changes = diffLines(oldStr, newStr);
        const patchLines: string[] = [];

        changes.forEach((part: Change) => {
            const lines = part.value.split("\n");
            // The last element is always an empty string from the split, so ignore it
            for (let i = 0; i < lines.length - 1; i++) {
                const line = lines[i];
                if (part.added) {
                    patchLines.push("+" + line);
                } else if (part.removed) {
                    patchLines.push("-" + line);
                } else {
                    patchLines.push(" " + line);
                }
            }
        });

        const hunk: Hunk = {
            oldStart: startLineNumber,
            oldLines: oldStr.split("\n").length - 1,
            newStart: startLineNumber,
            newLines: newStr.split("\n").length - 1,
            lines: patchLines,
        };

        return {
            oldFileName: "original",
            newFileName: "suggestion",
            oldHeader: "",
            newHeader: "",
            hunks: [hunk],
        };
    }

    const patch = $derived.by(() => {
        const oldContent = originalContent.endsWith("\n") || originalContent === "" ? originalContent : originalContent + "\n";
        const newContent = suggestedContent.endsWith("\n") || suggestedContent === "" ? suggestedContent : suggestedContent + "\n";

        return Promise.resolve(createStructuredPatchFromChanges(oldContent, newContent, startLine));
    });
</script>

<div class="suggestion-diff">
    <ConciseDiffView
        {patch}
        syntaxHighlighting={diffSettings.syntaxHighlighting}
        syntaxHighlightingTheme={globalOptions.syntaxHighlightingTheme}
        wordDiffs={diffSettings.wordDiffs}
        lineWrap={diffSettings.lineWrap}
        showComments={false}
    />
</div>

<style>
    .suggestion-diff {
        border: 1px solid var(--color-border);
        border-radius: 3px;
        overflow: hidden;
        margin: 8px 0;
        background: var(--color-neutral);
    }
</style>

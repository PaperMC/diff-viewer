import { parsePatch, type StructuredPatch } from "diff";

export function patchHeaderDiffOnly(patch: StructuredPatch): boolean {
    if (patch.hunks.length === 0) {
        return false;
    }
    let onlyHeaderChanges = true;
    for (let j = 0; j < patch.hunks.length; j++) {
        if (hasNonHeaderChanges(patch.hunks[j].lines)) {
            onlyHeaderChanges = false;
        }
    }
    return onlyHeaderChanges;
}

export function hasNonHeaderChanges(contentLines: string[]) {
    for (const line of contentLines) {
        if (lineHasNonHeaderChange(line)) {
            return true;
        }
    }
    return false;
}

const indexHeaderRegex = /^index [0-9a-f]+\.\.[0-9a-f]+ \d+$/;

function lineHasNonHeaderChange(line: string) {
    if (!(line.startsWith("+") || line.startsWith("-"))) {
        // context line
        return false;
    }

    // Added or removed content
    const content = line.substring(1);
    // Skip header lines and hunk headers in nested patches
    return !(
        content.startsWith("+++") ||
        content.startsWith("---") ||
        content.startsWith("@@ -") ||
        content.startsWith("@@ +") ||
        content.match(indexHeaderRegex)
    );
}

export function parseSinglePatch(rawPatchContent: string): StructuredPatch {
    const parsedPatches = parsePatch(rawPatchContent);
    if (parsedPatches.length !== 1) {
        throw Error("Only single-file patches are supported here");
    }
    return parsedPatches[0];
}

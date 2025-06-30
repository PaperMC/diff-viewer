import { expect, test } from "vitest";
import { splitMultiFilePatch } from "$lib/util";
import * as path from "node:path";
import * as fs from "node:fs";

test("Yield 2 patches from a patch file with signature", () => {
    const patch = loadPatch("patch-with-signature.patch");
    expect(splitMultiFilePatch(patch).length).toBe(2);
});

test("Yield 1 patches from a patch file with signature and double -- in the diff", () => {
    const patch = loadPatch("patch-with-multiple-minus-diff-with-signature.patch");
    expect(splitMultiFilePatch(patch).length).toBe(1);
});

test("Yield 2 patches from a patch file without signature", () => {
    const patch = loadPatch("patch-without-signature.patch");
    expect(splitMultiFilePatch(patch).length).toBe(2);
});

export function loadPatch(name: string): string {
    const filePath = path.resolve(__dirname, "patches", name);

    return fs.readFileSync(filePath, "utf8");
}

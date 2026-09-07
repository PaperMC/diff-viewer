import type { StructuredPatch } from "diff";
import { parseSinglePatch, patchHeaderDiffOnly } from "./patch-utils";
import { lazyPromise, type LazyPromise } from "./util";

export type FileStatus = "added" | "removed" | "modified" | "renamed" | "renamed_modified";
export const FILE_STATUSES: FileStatus[] = ["added", "removed", "modified", "renamed", "renamed_modified"];

export interface CommonFileDetails {
  index: number;
  fromFile: string;
  toFile: string;
  status: FileStatus;
}

export interface TextFileDetails extends CommonFileDetails {
  type: "text";
  structuredPatch: StructuredPatch;
  patchHeaderDiffOnly: boolean;
  addedLines: number;
  removedLines: number;
}

export interface ImageFileDetails extends CommonFileDetails {
  type: "image";
  image: ImageDiffDetails;
}

export function makeTextDetails(
  fromFile: string,
  toFile: string,
  status: FileStatus,
  patchText: string,
): TextFileDetails {
  const patch = parseSinglePatch(patchText);

  let addedLines = 0;
  let removedLines = 0;
  for (let j = 0; j < patch.hunks.length; j++) {
    const hunk = patch.hunks[j];

    for (let k = 0; k < hunk.lines.length; k++) {
      const line = hunk.lines[k];

      if (line.startsWith("+")) {
        addedLines++;
      } else if (line.startsWith("-")) {
        removedLines++;
      }
    }
  }

  return {
    index: -1,
    type: "text",
    fromFile,
    toFile,
    status,
    structuredPatch: patch,
    patchHeaderDiffOnly: patchHeaderDiffOnly(patch),
    addedLines,
    removedLines,
  };
}

export function makeImageDetails(
  fromFile: string,
  toFile: string,
  status: FileStatus,
  fromBlob?: Promise<Blob> | Blob,
  toBlob?: Promise<Blob> | Blob,
): ImageFileDetails {
  return {
    index: -1,
    type: "image",
    fromFile,
    toFile,
    status,
    image: {
      fileA: fromBlob !== undefined ? lazyPromise(async () => URL.createObjectURL(await fromBlob)) : null,
      fileB: toBlob !== undefined ? lazyPromise(async () => URL.createObjectURL(await toBlob)) : null,
      load: false,
    },
  };
}

export type FileDetails = TextFileDetails | ImageFileDetails;

export interface ImageDiffDetails {
  fileA: LazyPromise<string> | null;
  fileB: LazyPromise<string> | null;
  load: boolean;
}

export function requireEitherImage(details: ImageDiffDetails) {
  if (details.fileA) return details.fileA;
  if (details.fileB) return details.fileB;
  throw new Error("Neither image is available");
}

export function binaryFileDummyDetails(fromFile: string, toFile: string, status: FileStatus): TextFileDetails {
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

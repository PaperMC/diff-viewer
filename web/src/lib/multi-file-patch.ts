import { binaryFileDummyDetails, makeTextDetails, type FileDetails, type ImageFileDetails, type FileStatus } from "./file-details";
import { isImageFile } from "./util";

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
    onTotalCount: (total: number) => void,
    imageFactory?: (fromFile: string, toFile: string, status: FileStatus) => ImageFileDetails | null,
): AsyncGenerator<FileDetails> {
    const split = splitMultiFilePatch(patchContent);
    onTotalCount(split.length);
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

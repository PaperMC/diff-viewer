import type { TreeNode, TreeState } from "$lib/components/tree/index.svelte";
import type { FileDetails, MultiFileDiffViewerState } from "$lib/diff-viewer.svelte";
import { Debounced } from "runed";

export class FileTreeState {
    tree: TreeState<FileTreeNodeData> | undefined = $state();
    filter: string = $state("");
    readonly roots: TreeNode<FileTreeNodeData>[];
    readonly filterDebounced = new Debounced(() => this.filter, 500);
    readonly filteredFileDetails: FileDetails[];

    constructor(viewer: MultiFileDiffViewerState) {
        this.roots = $derived(makeFileTree(viewer.filteredFileDetails.array));
        this.filteredFileDetails = $derived(
            this.filterDebounced.current ? viewer.filteredFileDetails.array.filter((f) => this.filterFile(f)) : viewer.filteredFileDetails.array,
        );
    }

    filterFile(file: FileDetails): boolean {
        const queryLower = this.filterDebounced.current.toLowerCase();
        return file.toFile.toLowerCase().includes(queryLower) || file.fromFile.toLowerCase().includes(queryLower);
    }
}

export type FileTreeNodeData =
    | {
          type: "file";
          file: FileDetails;
      }
    | {
          type: "directory";
          name: string;
      };

export function makeFileTree(paths: FileDetails[]): TreeNode<FileTreeNodeData>[] {
    if (paths.length === 0) {
        return [];
    }

    const root: TreeNode<FileTreeNodeData> = {
        children: [],
        data: { type: "directory", name: "" },
    };

    for (const details of paths) {
        const parts = details.toFile.split("/");
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const existingChild = current.children.find((child) => child.data.type === "directory" && child.data.name === part);
            if (existingChild) {
                current = existingChild;
            } else {
                const file = i === parts.length - 1;
                const newChild: TreeNode<FileTreeNodeData> = {
                    children: [],
                    data: file
                        ? {
                              type: "file",
                              file: details,
                          }
                        : {
                              type: "directory",
                              name: part,
                          },
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
            if (node.data.name !== "") {
                node.data.name = `${node.data.name}/${node.children[0].data.name}`;
            } else {
                node.data.name = node.children[0].data.name;
            }
            node.children = node.children[0].children;
        }
    }

    mergeRedundantDirectories(root);

    if (root.data.type === "directory" && root.data.name === "") {
        return root.children;
    }
    return [root];
}

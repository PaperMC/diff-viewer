import { type Snippet } from "svelte";
import type { Getter } from "$lib/util";
import { watch } from "runed";
import { SvelteSet } from "svelte/reactivity";

export type TreeNode<T> = {
    children: TreeNode<T>[];
    data: T;
};

export interface TreeNodeView<T> extends TreeNode<T> {
    backingNode: TreeNode<T>;
    visibleChildren: TreeNodeView<T>[];
    depth: number;
}

export interface TreeProps<T> {
    instance?: TreeState<T>;
    roots: TreeNode<T>[];
    nodeRenderer: Snippet<
        [
            {
                node: TreeNodeView<T>;
                collapsed: boolean;
                toggleCollapse: () => void;
            },
        ]
    >;
    childWrapper?: Snippet<
        [
            {
                node: TreeNodeView<T>;
                collapsed: boolean;
                children: Snippet<[{ node: TreeNodeView<T> }]>;
            },
        ]
    > | null;
    filter?: ((node: TreeNode<T>) => boolean) | null;
}

export class TreeState<T> {
    roots: Getter<TreeNode<T>[]>;
    filter: Getter<((node: TreeNode<T>) => boolean) | null>;
    collapsedNodes: SvelteSet<TreeNode<T>> = new SvelteSet();
    allNodesSet: Set<TreeNode<T>> = $derived.by(() => collectAllNodes(this.roots()));
    filteredRoots: Set<TreeNodeView<T>> = $derived.by(() => filteredView(this.roots(), this.filter() ?? null));

    constructor(roots: Getter<TreeNode<T>[]>, filter: Getter<((node: TreeNode<T>) => boolean) | null>) {
        this.roots = roots;
        this.filter = filter;

        watch(
            () => this.allNodesSet,
            (newNodes, maybeOldNodes) => {
                const oldNodes = maybeOldNodes ?? new Set();
                const removed = oldNodes.difference(newNodes);
                for (const node of removed) {
                    // Remove no longer existing nodes from the collapsed set
                    this.collapsedNodes.delete(node);
                }
            },
        );
    }

    toggleCollapse(node: TreeNode<T>) {
        if (this.collapsedNodes.has(node)) {
            this.collapsedNodes.delete(node);
        } else {
            this.collapsedNodes.add(node);
        }
    }

    expand(node: TreeNode<T>) {
        this.collapsedNodes.delete(node);
    }

    expandParents(selector: (value: T) => boolean) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const thisInstance = this;

        function walk(node: TreeNode<T>, parents: TreeNode<T>[] = []): boolean {
            if (selector(node.data)) {
                for (let i = 0; i < parents.length; i++) {
                    thisInstance.expand(parents[i]);
                }
                return true;
            }
            parents.push(node);
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (walk(child, parents)) {
                    return true;
                }
            }
            parents.pop();
            return false;
        }

        this.roots().forEach((node) => walk(node));
    }
}

export function collectAllNodes<T>(roots: TreeNode<T>[]): Set<TreeNode<T>> {
    const allNodes = new Set<TreeNode<T>>();
    roots.forEach((root) => {
        const stack = [root];
        while (stack.length > 0) {
            const node = stack.pop()!;
            allNodes.add(node);
            stack.push(...node.children);
        }
    });
    return allNodes;
}

// Keep any nodes where the filter passes and all their parents
export function filteredView<T>(roots: TreeNode<T>[], filter: ((node: TreeNode<T>) => boolean) | null): Set<TreeNodeView<T>> {
    if (filter === null) {
        function walkDirect(node: TreeNode<T>, depth: number): TreeNodeView<T> {
            return { ...node, backingNode: node, visibleChildren: node.children.map((child) => walkDirect(child, depth + 1)), depth };
        }
        return new Set(roots.map((root) => walkDirect(root, 0)));
    }

    function walkFiltered(node: TreeNode<T>, depth: number): TreeNodeView<T> | null {
        let pass = filter!(node);
        const nodeView: TreeNodeView<T> = { ...node, backingNode: node, visibleChildren: [], depth };

        for (const child of node.children) {
            const newChild = walkFiltered(child, depth + 1);
            if (newChild) {
                pass = true;
                nodeView.visibleChildren.push(newChild);
            }
        }

        return pass ? nodeView : null;
    }

    const filtered: Set<TreeNodeView<T>> = new Set<TreeNodeView<T>>();

    for (const root of roots) {
        const rootView = walkFiltered(root, 0);
        if (rootView) {
            filtered.add(rootView);
        }
    }

    return filtered;
}

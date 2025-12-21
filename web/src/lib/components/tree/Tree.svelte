<script lang="ts" generics="T">
    import { type TreeProps, type TreeNodeView, TreeState } from "./index.svelte";

    let { instance = $bindable(undefined), roots, nodeRenderer, childWrapper = null, filter = null }: TreeProps<T> = $props();

    if (!instance) {
        instance = new TreeState(
            () => roots,
            () => filter,
        );
    }

    function requireInstance() {
        if (instance === undefined) {
            throw new Error("Tree instance is not defined");
        }
        return instance;
    }
</script>

{#snippet renderNode({ node }: { node: TreeNodeView<T> })}
    {@const collapsed = requireInstance().collapsedNodes.has(node.backingNode)}
    {@render nodeRenderer({ node, collapsed, toggleCollapse: () => requireInstance().toggleCollapse(node.backingNode) })}
    {#if childWrapper !== null}
        {@render childWrapper({ node, collapsed, children: renderChildren })}
    {:else}
        {@const childrenVisible = !collapsed && node.visibleChildren.length > 0}
        <div class={{ "ps-4": true, hidden: childrenVisible }}>
            {@render renderChildren({ node })}
        </div>
    {/if}
{/snippet}

{#snippet renderChildren({ node }: { node: TreeNodeView<T> })}
    {#each node.visibleChildren as childNode (childNode)}
        {@render renderNode({ node: childNode })}
    {/each}
{/snippet}

{#each requireInstance().filteredRoots as root (root)}
    {@render renderNode({ node: root })}
{/each}

<script lang="ts">
    import { type RestProps } from "$lib/types";
    import { type Snippet } from "svelte";
    import { Button, mergeProps } from "bits-ui";
    import { type DirectoryEntry, pickDirectory } from "$lib/components/files/index.svelte";

    type Props = {
        children?: Snippet<[{ directory?: DirectoryEntry }]>;
        directory?: DirectoryEntry;
    } & RestProps;

    let { children, directory = $bindable<DirectoryEntry | undefined>(undefined), ...restProps }: Props = $props();

    async function onclick() {
        try {
            directory = await pickDirectory();
        } catch (e) {
            if (e instanceof Error && e.name === "AbortError") {
                return;
            } else {
                console.error("Failed to pick directory", e);
            }
        }
    }

    const mergedProps = mergeProps({ onclick }, restProps);
</script>

<Button.Root type="button" {...mergedProps}>
    {@render children?.({ directory })}
</Button.Root>

<script lang="ts">
    import { Button, mergeProps } from "bits-ui";
    import { type DirectoryEntry, type DirectoryInputProps, DirectoryInputState } from "$lib/components/files/index.svelte";
    import { box } from "svelte-toolbelt";

    let { children, directory = $bindable<DirectoryEntry | undefined>(), picking = $bindable(false), ...restProps }: DirectoryInputProps = $props();

    const instance = new DirectoryInputState({
        directory: box.with(
            () => directory,
            (v) => (directory = v),
        ),
        picking: box.with(
            () => picking,
            (v) => (picking = v),
        ),
    });

    const mergedProps = $derived(mergeProps(instance.props, restProps));
</script>

<Button.Root type="button" {...mergedProps}>
    {@render children?.({ directory, picking })}
</Button.Root>

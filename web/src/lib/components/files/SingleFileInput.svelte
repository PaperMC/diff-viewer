<script lang="ts">
    import { useId } from "bits-ui";
    import { type RestProps } from "$lib/types";
    import { type Snippet } from "svelte";
    import { watch } from "runed";

    type Props = {
        children?: Snippet<[{ file?: File }]>;
        file?: File;
    } & RestProps;

    let { children, file = $bindable<File | undefined>(undefined), ...restProps }: Props = $props();

    let files = $state<FileList | undefined>();

    watch(
        () => files,
        (newFiles) => {
            if (newFiles && newFiles.length > 0) {
                file = newFiles[0];
            }
        },
    );

    const labelId = useId();
    const inputId = useId();
</script>

<label id={labelId} for={inputId} {...restProps}>
    {@render children?.({ file })}
    <input id={inputId} aria-labelledby={labelId} type="file" bind:files class="sr-only" />
</label>

<script lang="ts">
    import type { RestProps } from "$lib/types";
    import { mergeProps } from "bits-ui";

    interface Props extends RestProps {
        size?: number;
    }

    let { size = 8, ...restProps }: Props = $props();

    let mergedProps = $derived(
        mergeProps(
            {
                class: "animate-spin rounded-full border-2 border-em-disabled border-b-em-high",
                style: {
                    height: `${size * 0.25}rem`,
                    width: `${size * 0.25}rem`,
                },
            },
            restProps,
        ),
    );
</script>

<div {...mergedProps}></div>

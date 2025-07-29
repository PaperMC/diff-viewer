<script lang="ts">
    import { mergeProps, Progress } from "bits-ui";
    import { type ProgressBarProps, useProgressBarState } from "$lib/components/progress-bar/index.svelte";

    let { state = $bindable(), ...restProps }: ProgressBarProps = $props();

    state = useProgressBarState(state);

    const mergedProps = $derived(
        mergeProps(
            {
                class: "bg-em-disabled/30 inset-shadow-xs relative overflow-hidden rounded-full",
            },
            restProps,
        ),
    );
</script>

<Progress.Root value={state.value} max={state.max} {...mergedProps}>
    {@const percent = state.getPercent()}
    {#if percent !== undefined}
        <div
            class="h-full w-full rounded-full bg-primary drop-shadow-sm drop-shadow-primary/50 transition-all duration-250 ease-in-out"
            style={`transform: translateX(-${100 - percent}%)`}
        ></div>
    {:else}
        <div id="spinner" class="h-full w-[20%] rounded-full bg-primary drop-shadow-sm drop-shadow-primary/50"></div>
    {/if}
</Progress.Root>

<style>
    #spinner {
        animation: slide 1s linear infinite alternate;
    }

    @keyframes slide {
        0% {
            transform: translateX(0%);
        }
        100% {
            transform: translateX(400%);
        }
    }
</style>

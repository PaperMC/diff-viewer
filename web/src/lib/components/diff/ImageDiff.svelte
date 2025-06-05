<script lang="ts">
    import { RadioGroup, Slider } from "bits-ui";
    import Spinner from "$lib/components/Spinner.svelte";
    import { getDimensions, type ImageDimensions } from "$lib/image";
    import AddedOrRemovedImageLabel from "$lib/components/diff/AddedOrRemovedImageLabel.svelte";
    import { ElementSize } from "runed";

    interface Props {
        fileA: string;
        fileB: string;
    }

    const { fileA, fileB }: Props = $props();

    type Mode = "side-by-side" | "slide" | "fade";
    type DimensionData = {
        a: ImageDimensions;
        b: ImageDimensions;
    };

    let imageDimensions: Promise<DimensionData> = $derived.by(async () => {
        const [a, b] = await Promise.all([getDimensions(fileA), getDimensions(fileB)]);
        return { a, b };
    });
    let mode: Mode = $state("side-by-side");
    let slidePercent: number = $state(50);
    let fadePercent: number = $state(50);

    function getStyle(side: "a" | "b", dims: DimensionData): string {
        let style = "";
        if (side === "a") {
            if (dims.b.width > dims.a.width) {
                const scale = dims.a.width / dims.b.width;
                style += `max-width: ${scale * 100}%;`;
            }
        } else {
            if (dims.a.width > dims.b.width) {
                const scale = dims.b.width / dims.a.width;
                style += `max-width: ${scale * 100}%;`;
            }
        }
        return style;
    }

    let overlayImgA: HTMLDivElement | undefined = $state();
    let overlayImgASize = new ElementSize(() => overlayImgA);
    let overlayImgB: HTMLImageElement | undefined = $state();
    let overlayImgBSize = new ElementSize(() => overlayImgB);
    let overlayContainerStyle = $derived.by(() => {
        if (overlayImgASize.height < overlayImgBSize.height) {
            // pad image A's height to match B's height
            return `height: ${overlayImgBSize.height}px;`;
        }
        return "";
    });
</script>

{#snippet modeButton(forMode: Mode, iconClass: string)}
    <RadioGroup.Item
        value={forMode}
        class="flex items-center justify-center rounded-sm btn-ghost px-2 py-1 text-primary data-[state=checked]:btn-ghost-visible"
    >
        <span class="iconify {iconClass} me-1 size-4" aria-hidden="true"></span>{forMode}
    </RadioGroup.Item>
{/snippet}

{#snippet modeSelector()}
    <RadioGroup.Root title="Comparison Mode" bind:value={mode} class="mb-4 flex flex-row gap-1 rounded-lg bg-neutral p-1.5 shadow-sm">
        {@render modeButton("slide", "octicon--image-16")}
        {@render modeButton("side-by-side", "octicon--columns-16")}
        {@render modeButton("fade", "octicon--image-16")}
    </RadioGroup.Root>
{/snippet}

{#snippet sideBySide(dims: DimensionData)}
    <div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="flex flex-col items-center justify-center gap-4">
            <img src={fileA} alt="A" class="png-bg h-auto border-2 border-red-600 shadow-md" style={getStyle("a", dims)} />
            <AddedOrRemovedImageLabel mode="remove" dims={dims.a} />
        </div>
        <div class="flex flex-col items-center justify-center gap-4">
            <img src={fileB} alt="B" class="png-bg h-auto border-2 border-green-600 shadow-md" style={getStyle("b", dims)} />
            <AddedOrRemovedImageLabel mode="add" dims={dims.b} />
        </div>
    </div>
{/snippet}

{#snippet slide(dims: DimensionData)}
    <div class="flex flex-row items-center gap-4">
        <AddedOrRemovedImageLabel mode="remove" dims={dims.a} />
        <div class="relative grid grid-cols-1 gap-4" style={overlayContainerStyle}>
            <img
                bind:this={overlayImgA}
                src={fileA}
                alt="A"
                class="png-bg h-auto w-full place-self-center border-2 border-red-600 shadow-md"
                draggable="false"
                style={getStyle("a", dims)}
            />
            <div class="absolute flex size-full">
                <Slider.Root
                    type="single"
                    thumbPositioning="exact"
                    bind:value={slidePercent}
                    class="relative m-auto flex size-fit touch-none select-none"
                    style={getStyle("b", dims)}
                >
                    <img
                        bind:this={overlayImgB}
                        src={fileB}
                        alt="B"
                        class="png-bg size-full border-2 border-green-600 shadow-md"
                        draggable="false"
                        style="clip-path: inset(0 0 0 {slidePercent}%);"
                    />
                    <span class="absolute h-full w-0.5 -translate-x-1/2 bg-em-disabled/80" style="left: calc({slidePercent}%);"></span>
                    <Slider.Thumb index={0} class="group absolute flex h-full cursor-col-resize select-none">
                        <div class="flex place-self-center rounded-sm bg-neutral px-0.5 py-1 shadow-sm group-data-active:scale-[0.95]">
                            <span class="iconify size-4 place-self-center octicon--grabber-16"></span>
                        </div>
                    </Slider.Thumb>
                </Slider.Root>
            </div>
        </div>
        <AddedOrRemovedImageLabel mode="add" dims={dims.b} />
    </div>
{/snippet}

{#snippet fade(dims: DimensionData)}
    <div class="flex flex-row items-center gap-4">
        <AddedOrRemovedImageLabel mode="remove" dims={dims.a} />
        <div class="relative grid grid-cols-1 gap-4" style={overlayContainerStyle}>
            <img
                bind:this={overlayImgA}
                src={fileA}
                alt="A"
                class="png-bg h-auto w-full place-self-center border-2 border-red-600 shadow-md"
                draggable="false"
                style={getStyle("a", dims)}
            />
            <img
                bind:this={overlayImgB}
                src={fileB}
                alt="B"
                class="png-bg absolute h-auto max-w-full place-self-center border-2 border-green-600 shadow-md"
                draggable="false"
                style="opacity: {fadePercent}%; {getStyle('b', dims)}"
            />
        </div>
        <AddedOrRemovedImageLabel mode="add" dims={dims.b} />
    </div>
    <div class="sticky bottom-4 mt-4 flex w-full max-w-[280px] items-center rounded-lg bg-neutral p-2.5 shadow-sm">
        <Slider.Root type="single" thumbPositioning="exact" bind:value={fadePercent} class="relative flex w-full touch-none items-center select-none">
            <span class="relative h-0.5 w-full grow cursor-pointer overflow-hidden rounded-full bg-em-disabled">
                <Slider.Range class="absolute h-full bg-primary" />
            </span>
            <Slider.Thumb index={0} class="block size-4 cursor-pointer rounded-full border bg-neutral shadow-sm transition-colors data-active:scale-[0.95]" />
        </Slider.Root>
    </div>
{/snippet}

<div class="relative flex flex-col items-center justify-center bg-neutral-2 p-4">
    {@render modeSelector()}
    {#await imageDimensions}
        <Spinner />
    {:then dims}
        {#if mode === "side-by-side"}
            {@render sideBySide(dims)}
        {:else if mode === "slide"}
            {@render slide(dims)}
        {:else if mode === "fade"}
            {@render fade(dims)}
        {/if}
    {/await}
</div>

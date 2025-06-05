<script lang="ts">
    import { type MultimodalFileInputProps, MultimodalFileInputState } from "$lib/components/files/index.svelte";
    import { box } from "svelte-toolbelt";
    import { RadioGroup } from "bits-ui";
    import SingleFileInput from "$lib/components/files/SingleFileInput.svelte";

    let { label = "File", state = $bindable() }: MultimodalFileInputProps = $props();

    const instance = new MultimodalFileInputState({
        label: box.with(() => label),
        state,
    });
    state = instance;

    function handleDragOver(event: DragEvent) {
        instance.dragActive = true;
        event.preventDefault();
    }

    function handleDragLeave(event: DragEvent) {
        if (event.currentTarget === event.target) {
            instance.dragActive = false;
        }
        event.preventDefault();
    }

    async function handleFileDrop(event: DragEvent) {
        instance.dragActive = false;
        event.preventDefault();
        const files = event.dataTransfer?.files;
        if (!files || files.length !== 1) {
            alert("Only one file can be dropped at a time.");
            return;
        }
        instance.file = files[0];
        instance.mode = "file";
    }
</script>

{#snippet radioItem(name: string)}
    <RadioGroup.Item value={name.toLowerCase()}>
        {#snippet children({ checked })}
            <span class="rounded-sm px-1 py-0.5 text-sm" class:btn-ghost={!checked} class:border={!checked} class:btn-primary={checked}>
                {name}
            </span>
        {/snippet}
    </RadioGroup.Item>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="file-drop-target w-full"
    data-drag-active={instance.dragActive}
    ondragover={handleDragOver}
    ondrop={handleFileDrop}
    ondragleavecapture={handleDragLeave}
>
    <RadioGroup.Root class="mb-1 flex w-full gap-1" bind:value={instance.mode}>
        {@render radioItem("File")}
        {@render radioItem("URL")}
        {@render radioItem("Text")}
    </RadioGroup.Root>
    {#if instance.mode === "file"}
        {@render fileInput()}
    {:else if instance.mode === "url"}
        {@render urlInput()}
    {:else if instance.mode === "text"}
        {@render textInput()}
    {/if}
</div>

{#snippet fileInput()}
    <SingleFileInput bind:file={instance.file} class="flex w-fit items-center gap-2 rounded-md border btn-ghost px-2 py-1 has-focus-visible:outline-2">
        <span class="iconify size-4 shrink-0 text-em-disabled octicon--file-16"></span>
        {#if instance.file}
            {instance.file.name}
        {:else}
            <span class="font-light">{label}</span>
        {/if}
        <span class="iconify size-4 shrink-0 text-em-disabled octicon--triangle-down-16"></span>
    </SingleFileInput>
{/snippet}

{#snippet urlInput()}
    <input title="{label} URL" placeholder="Enter file URL" bind:value={instance.url} type="url" class="w-full rounded-md border px-2 py-1" />
{/snippet}

{#snippet textInput()}
    <textarea title="{label} Text" bind:value={instance.text} placeholder="Enter text here" class="w-full rounded-md border px-2 py-1"></textarea>
{/snippet}

<style>
    .file-drop-target {
        position: relative;
    }
    .file-drop-target[data-drag-active="true"]::before {
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
        display: flex;
        align-items: center;
        justify-content: center;

        content: "Drop file here";
        font-size: var(--text-3xl);
        color: var(--color-black);

        background-color: rgba(255, 255, 255, 0.7);

        border: dashed var(--color-primary);
        border-radius: inherit;
    }
</style>

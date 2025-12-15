<script lang="ts">
    import { type MultimodalFileInputProps, MultimodalFileInputState } from "$lib/components/files/index.svelte";
    import { box } from "svelte-toolbelt";
    import { RadioGroup } from "bits-ui";
    import SingleFileInput from "$lib/components/files/SingleFileInput.svelte";
    import FileTypeSelect from "$lib/components/files/FileTypeSelect.svelte";

    let { state = $bindable(), label = "File", required = false, fileTypeOverride = true, defaultMode = "text" }: MultimodalFileInputProps = $props();

    const instance = new MultimodalFileInputState({
        state,
        label: box.with(() => label),
        required: box.with(() => required),
        fileTypeOverride: box.with(() => fileTypeOverride),
        defaultMode: box.with(() => defaultMode),
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

    async function handleDrop(event: DragEvent) {
        instance.dragActive = false;
        event.preventDefault();
        if (!event.dataTransfer) {
            return;
        }

        const types = event.dataTransfer.types;
        const files = event.dataTransfer.files;

        // Handle file drops
        if (files.length > 1) {
            alert("Only one file can be dropped at a time.");
            return;
        } else if (files.length === 1) {
            instance.file = files[0];
            instance.mode = "file";
            return;
        }

        // Handle URL drops
        if (types.includes("text/uri-list")) {
            const urls = event.dataTransfer
                .getData("text/uri-list")
                .split("\n")
                .filter((url) => url && !url.startsWith("#"));
            if (urls.length > 1) {
                alert("Only one URL can be dropped at a time.");
                return;
            } else if (urls.length === 1) {
                instance.url = urls[0];
                instance.mode = "url";
                return;
            }
        }

        // Handle plain text drops
        if (types.includes("text/plain")) {
            const text = event.dataTransfer.getData("text/plain");
            if (text) {
                instance.text = text;
                instance.mode = "text";
                return;
            }
        }
    }
</script>

{#snippet radioItem(name: string)}
    <RadioGroup.Item
        value={name.toLowerCase()}
        class="rounded-sm px-2 text-sm ring-primary hover:bg-neutral/65 focus:outline-none focus-visible:ring-2 data-[state=checked]:bg-neutral data-[state=checked]:shadow-sm"
    >
        {name}
    </RadioGroup.Item>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="file-drop-target w-full"
    data-drag-active={instance.dragActive}
    ondragover={handleDragOver}
    ondrop={handleDrop}
    ondragleavecapture={handleDragLeave}
>
    <div class="mb-1 flex w-full flex-wrap items-center gap-1">
        <RadioGroup.Root class="me-2 flex overflow-hidden rounded-md bg-neutral-3 p-0.5" bind:value={instance.mode}>
            {@render radioItem("File")}
            {@render radioItem("Text")}
            {@render radioItem("URL")}
        </RadioGroup.Root>
        {#if fileTypeOverride}
            <FileTypeSelect allowAuto={instance.mode !== "text"} bind:value={() => instance.getFileType(), (v) => instance.setFileType(v)} />
        {/if}
    </div>
    {#if instance.mode === "file"}
        {@render fileInput()}
    {:else if instance.mode === "url"}
        {@render urlInput()}
    {:else if instance.mode === "text"}
        {@render textInput()}
    {/if}
</div>

{#snippet fileInput()}
    <SingleFileInput required {label} bind:file={instance.file} />
{/snippet}

{#snippet urlInput()}
    <input
        title="{label} URL"
        bind:value={instance.url}
        placeholder="Enter file URL"
        type="url"
        {required}
        class="w-full rounded-md border bg-neutral px-2 py-1 inset-shadow-xs ring-primary focus:outline-none focus-visible:ring-2"
    />
{/snippet}

{#snippet textInput()}
    <textarea
        title="{label} Text"
        bind:value={instance.text}
        placeholder="Enter text here"
        {required}
        class="w-full rounded-md border bg-neutral px-2 py-1 inset-shadow-xs ring-primary focus:outline-none focus-visible:ring-2"
    ></textarea>
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

        content: "Drop here";
        font-size: var(--text-3xl);
        color: var(--color-black);

        background-color: rgba(255, 255, 255, 0.7);

        border: dashed var(--color-primary);
        border-radius: inherit;
    }
</style>

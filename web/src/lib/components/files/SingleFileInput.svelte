<script lang="ts">
    type Props = {
        label?: string;
        required?: boolean;
        file?: File;
    };

    let { label = "File", required = false, file = $bindable<File | undefined>(undefined) }: Props = $props();

    function getFiles() {
        if (file) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            return dataTransfer.files;
        }
        return new DataTransfer().files;
    }

    function setFiles(files: FileList | null) {
        if (files && files.length > 0) {
            file = files[0];
        } else {
            file = undefined;
        }
    }

    const uid = $props.id();
    const labelId = `${uid}-label`;
    const inputId = `${uid}-input`;
</script>

<label id={labelId} for={inputId} class="relative flex w-fit items-center gap-2 rounded-md border btn-ghost px-2 py-1 has-focus-visible:outline-2">
    <span class="iconify size-4 shrink-0 text-em-disabled octicon--file-16"></span>
    {#if file}
        {file.name}
    {:else}
        <span class="font-light">{label}</span>
    {/if}
    <span class="iconify size-4 shrink-0 text-em-disabled octicon--triangle-down-16"></span>
    <input id={inputId} aria-labelledby={labelId} type="file" {required} bind:files={getFiles, setFiles} class="absolute top-0 left-0 size-full opacity-0" />
</label>

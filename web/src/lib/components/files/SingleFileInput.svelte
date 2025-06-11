<script lang="ts">
    import { watch } from "runed";

    type Props = {
        label?: string;
        required?: boolean;
        file?: File;
    };

    let { label = "File", required = false, file = $bindable<File | undefined>(undefined) }: Props = $props();

    let files = $state<FileList | undefined>();

    watch(
        () => files,
        (newFiles) => {
            if (newFiles && newFiles.length > 0) {
                file = newFiles[0];
            }
        },
    );

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
    <input id={inputId} aria-labelledby={labelId} type="file" {required} bind:files class="absolute top-0 left-0 size-full opacity-0" />
</label>

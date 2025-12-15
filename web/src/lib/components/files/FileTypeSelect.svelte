<script lang="ts" module>
    import { type BundledLanguage, bundledLanguagesInfo, type SpecialLanguage } from "shiki";

    type LanguageOption = {
        id: string;
        name: string;
        aliases: string[];
    };

    const languages: LanguageOption[] = [
        { id: "plaintext", name: "Plain Text", aliases: ["txt"] },
        ...bundledLanguagesInfo.map((info) => {
            const aliases = [info.id];
            if (info.aliases) {
                for (const alias of info.aliases) {
                    if (alias !== info.id) {
                        aliases.push(alias);
                    }
                }
            }
            return {
                id: info.id,
                name: info.name,
                aliases,
            };
        }),
    ];
    languages.sort((a, b) => a.name.localeCompare(b.name));

    const languagesMap = new Map<string, LanguageOption>();
    for (const lang of languages) {
        languagesMap.set(lang.id, lang);
    }
</script>

<script lang="ts">
    import { Label, Select } from "bits-ui";

    interface Props {
        value?: BundledLanguage | SpecialLanguage | "auto";
        allowAuto?: boolean;
    }

    let { value = $bindable("auto"), allowAuto = true }: Props = $props();

    const uid = $props.id();
    const fileTypeId = `file-type-${uid}`;
    const fileTypeLabelId = `file-type-label-${uid}`;
</script>

<div class="flex items-center gap-1">
    <!-- TODO Label gets active & hover styles, but doesn't open selector -->
    <Label.Root id={fileTypeLabelId} for={fileTypeId} class="text-sm">File Type</Label.Root>
    <Select.Root type="single" bind:value scrollAlignment="center">
        <Select.Trigger
            id={fileTypeId}
            aria-labelledby={fileTypeLabelId}
            class="flex items-center gap-1 rounded-sm btn-fill-neutral px-2 text-sm data-[state=open]:bg-(--btn-hover) data-[state=open]:active:bg-(--btn-active)"
        >
            {#if value === "auto"}
                Infer Type
            {:else}
                {languagesMap.get(value)?.name ?? "Unknown Type (Error?)"}
            {/if}
            <span aria-hidden="true" class="iconify size-4 shrink-0 text-base text-em-med octicon--triangle-down-16"></span>
        </Select.Trigger>
        <Select.Portal>
            <Select.Content class="z-100 mt-0.5 flex max-h-64 flex-col gap-1 rounded-md border bg-neutral p-1 shadow-md">
                {#if allowAuto}
                    <Select.Group>
                        <Select.Item
                            value="auto"
                            class="cursor-default rounded-sm border px-2 py-1 text-sm data-highlighted:bg-neutral-3 data-selected:bg-primary data-selected:text-white"
                        >
                            Infer Type
                        </Select.Item>
                    </Select.Group>
                {/if}
                <Select.Group class="flex grow flex-col overflow-y-auto rounded-sm border">
                    {#each languages as lang (lang.id)}
                        <Select.Item
                            value={lang.id}
                            class="group flex cursor-default flex-col px-2 py-1 text-sm data-highlighted:bg-neutral-3 data-selected:bg-primary data-selected:text-white"
                        >
                            {lang.name}
                            <span class="text-sm font-light text-em-med group-data-selected:text-white/80">{lang.aliases.join(", ")}</span>
                        </Select.Item>
                    {/each}
                </Select.Group>
            </Select.Content>
        </Select.Portal>
    </Select.Root>
</div>

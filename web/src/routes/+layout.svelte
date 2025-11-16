<script lang="ts">
    import "../app.css";
    import { initThemeHooks } from "$lib/theme.svelte";
    import { Tooltip } from "bits-ui";
    import { type LayoutProps } from "./$types";
    import { GlobalOptions } from "$lib/global-options.svelte";

    let { children, data }: LayoutProps = $props();
    GlobalOptions.init(data.globalOptions);

    initThemeHooks();
</script>

<Tooltip.Provider delayDuration={100}>
    <div class="min-h-screen bg-neutral">
        {@render children()}
    </div>
</Tooltip.Provider>

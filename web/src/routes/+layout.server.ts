import type { LayoutServerLoad } from "./$types";
import { GlobalOptions } from "$lib/diff-viewer-multi-file.svelte";

export const load: LayoutServerLoad = async ({ cookies }) => {
    return {
        globalOptions: cookies.get(GlobalOptions.key),
    };
};

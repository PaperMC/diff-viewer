import { GlobalOptions } from "$lib/global-options.svelte";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ cookies }) => {
    return {
        globalOptions: cookies.get(GlobalOptions.key),
    };
};

import { ROOT_LAYOUT_KEY, type PersistentLayoutState } from "$lib/layout.svelte";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ cookies }) => {
    const cookie = cookies.get(ROOT_LAYOUT_KEY);
    const parsed: PersistentLayoutState | null = cookie ? JSON.parse(cookie) : null;
    return {
        rootLayout: parsed,
    };
};

import { ROOT_LAYOUT_KEY, type PersistentLayoutState } from "$lib/layout.svelte";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ cookies }) => {
    const cookie = cookies.get(ROOT_LAYOUT_KEY);
    let parsed: PersistentLayoutState | null = null;
    if (cookie) {
        try {
            parsed = JSON.parse(cookie);
        } catch {
            // Ignore invalid cookie
        }
    }
    return {
        rootLayout: parsed,
    };
};

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        // interface Locals {}
        // interface PageData {}
        interface PageState {
            /**
             * whether this state entry loaded patches. when true, selection is likely to be unresolved,
             * and scrollOffset is likely to be 0.
             */
            initialLoad?: boolean;
            scrollOffset?: number;
            selection?: {
                fileIdx: number;
                lines?: LineSelection;
                unresolvedLines?: UnresolvedLineSelection;
            };
        }
        // interface Platform {}
    }
}

export {};

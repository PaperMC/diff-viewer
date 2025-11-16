import { GlobalOptions } from "$lib/global-options.svelte";
import type { Pane } from "paneforge";
import { clearCookie, setCookie } from "./util";

export const ROOT_LAYOUT_KEY = "diff-viewer-root-layout";
export interface PersistentLayoutState {
    sidebarWidth: number;
}

export class LayoutState {
    private readonly globalOptions: GlobalOptions;

    sidebarCollapsed = $state(false);

    windowInnerWidth: number | undefined = $state();
    sidebarPane: Pane | undefined = $state();
    lastSidebarWidth: number | undefined = $state();

    minSidebarWidth = $derived.by(() => {
        return this.getProportion(200, 0);
    });
    defaultSidebarWidth = $derived.by(() => {
        if (this.lastSidebarWidth !== undefined) {
            return this.lastSidebarWidth;
        }
        return this.getProportion(350, 0.25);
    });

    defaultMainWidth = $derived.by(() => {
        if (this.lastSidebarWidth !== undefined) {
            return 100 - this.lastSidebarWidth;
        }
        return undefined;
    });

    constructor(state: PersistentLayoutState | null) {
        this.lastSidebarWidth = state?.sidebarWidth;
        this.globalOptions = GlobalOptions.get();
    }

    toggleSidebar() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
    }

    private getProportion(px: number, defaultValue: number) {
        if (this.windowInnerWidth === undefined) {
            return defaultValue;
        }
        return Math.max(0, Math.min(100, Math.ceil((px / this.windowInnerWidth) * 100)));
    }

    resetLayout() {
        clearCookie(ROOT_LAYOUT_KEY);
        this.lastSidebarWidth = undefined;
        if (this.sidebarPane) {
            this.sidebarPane.resize(this.defaultSidebarWidth);
        }
    }

    onSidebarResize(size: number, prevSize: number | undefined) {
        if (prevSize === undefined) {
            // Prevent initial resize from triggering update loop
            return;
        }

        this.lastSidebarWidth = size;
        const rootLayout: PersistentLayoutState = {
            sidebarWidth: this.lastSidebarWidth,
        };
        setCookie(ROOT_LAYOUT_KEY, JSON.stringify(rootLayout));
    }
}

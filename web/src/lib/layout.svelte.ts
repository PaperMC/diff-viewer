import type { Pane } from "paneforge";
import { clearCookie, setCookie } from "./util";
import { watch } from "runed";

export const ROOT_LAYOUT_KEY = "diff-viewer-root-layout";
export interface PersistentLayoutState {
    sidebarWidth: number;
}

export class LayoutState {
    sidebarCollapsed = $state(false);

    windowInnerWidth: number | undefined = $state();
    sidebarPane: Pane | undefined = $state();
    lastSidebarWidth: number | undefined = $state();

    minSidebarWidth = $derived.by(() => {
        return this.getContainerProportion(200, 0);
    });
    defaultSidebarWidth = $derived.by(() => {
        if (this.lastSidebarWidth !== undefined) {
            return this.lastSidebarWidth;
        }
        return this.getContainerProportion(350, 0.25);
    });

    defaultMainWidth = $derived.by(() => {
        if (this.lastSidebarWidth !== undefined) {
            return 100 - this.lastSidebarWidth;
        }
        return undefined;
    });

    constructor(state: PersistentLayoutState | null) {
        this.lastSidebarWidth = state?.sidebarWidth;

        // Maintain sidebar size when resizing window
        watch.pre(
            () => this.windowInnerWidth,
            (newValue, oldValue) => {
                if (oldValue !== undefined && newValue !== undefined && this.sidebarPane) {
                    const oldPx = (this.sidebarPane.getSize() / 100) * oldValue;
                    const newProportion = this.getProportion(oldPx, newValue);
                    this.sidebarPane.resize(newProportion);
                }
            },
        );
    }

    toggleSidebar() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
    }

    private getContainerProportion(px: number, defaultValue: number) {
        if (this.windowInnerWidth === undefined) {
            return defaultValue;
        }
        return this.getProportion(px, this.windowInnerWidth);
    }

    private getProportion(px: number, max: number) {
        return Math.max(0, Math.min(100, (px / max) * 100));
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

        /*
        TODO:
        *also* persist size in px to avoid sidebar changing size when reopening with
        a different sized window

        need to keep the proportion for SSR as paneforge does not currently provide
        a way to preset a size in px (it generally works in proportions only)

        this means there may be a shift on hydration when a new window uses an old cookie
        
        see GH:svecosystem/paneforge/issues/91
        */
        this.lastSidebarWidth = size;
        const rootLayout: PersistentLayoutState = {
            sidebarWidth: this.lastSidebarWidth,
        };
        setCookie(ROOT_LAYOUT_KEY, JSON.stringify(rootLayout));
    }
}

import type { BundledTheme } from "shiki";
import { browser } from "$app/environment";
import { getEffectiveGlobalTheme } from "$lib/theme.svelte";
import { watchLocalStorage } from "$lib/util";
import { Context } from "runed";

export const DEFAULT_THEME_LIGHT: BundledTheme = "github-light-default";
export const DEFAULT_THEME_DARK: BundledTheme = "github-dark-default";

export type SidebarLocation = "left" | "right";

export class GlobalOptions {
    static readonly key = "diff-viewer-global-options";
    private static readonly context = new Context<GlobalOptions>(GlobalOptions.key);

    static init(cookie?: string) {
        const opts = new GlobalOptions();
        if (!browser) {
            GlobalOptions.context.set(opts);
            if (cookie) {
                opts.deserialize(cookie);
            }
            return opts;
        }
        const serialized = localStorage.getItem(GlobalOptions.key);
        if (serialized !== null) {
            opts.deserialize(serialized);
        }
        GlobalOptions.context.set(opts);
        return opts;
    }

    static get() {
        return GlobalOptions.context.get();
    }

    syntaxHighlighting = $state(true);
    syntaxHighlightingThemeLight: BundledTheme = $state(DEFAULT_THEME_LIGHT);
    syntaxHighlightingThemeDark: BundledTheme = $state(DEFAULT_THEME_DARK);
    wordDiffs = $state(true);
    lineWrap = $state(true);
    omitPatchHeaderOnlyHunks = $state(true);
    sidebarLocation: SidebarLocation = $state("left");

    private constructor() {
        $effect(() => {
            this.save();
        });

        watchLocalStorage(GlobalOptions.key, (newValue) => {
            if (newValue) {
                this.deserialize(newValue);
            }
        });
    }

    get syntaxHighlightingTheme() {
        switch (getEffectiveGlobalTheme()) {
            case "dark":
                return this.syntaxHighlightingThemeDark;
            case "light":
                return this.syntaxHighlightingThemeLight;
        }
    }

    private save() {
        if (!browser) {
            return;
        }
        localStorage.setItem(GlobalOptions.key, this.serialize());
        document.cookie = `${GlobalOptions.key}=${encodeURIComponent(this.serializeCookie())}; path=/; max-age=31536000; SameSite=Lax`;
    }

    private serialize() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cereal: any = {
            syntaxHighlighting: this.syntaxHighlighting,
            omitPatchHeaderOnlyHunks: this.omitPatchHeaderOnlyHunks,
            wordDiff: this.wordDiffs,
            lineWrap: this.lineWrap,
            sidebarLocation: this.sidebarLocation,
        };
        if (this.syntaxHighlightingThemeLight !== DEFAULT_THEME_LIGHT) {
            cereal.syntaxHighlightingThemeLight = this.syntaxHighlightingThemeLight;
        }
        if (this.syntaxHighlightingThemeDark !== DEFAULT_THEME_DARK) {
            cereal.syntaxHighlightingThemeDark = this.syntaxHighlightingThemeDark;
        }
        return JSON.stringify(cereal);
    }

    private serializeCookie() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cereal: any = {
            sidebarLocation: this.sidebarLocation,
        };
        return JSON.stringify(cereal);
    }

    private deserialize(serialized: string) {
        const jsonObject = JSON.parse(serialized);
        if (jsonObject.syntaxHighlighting !== undefined) {
            this.syntaxHighlighting = jsonObject.syntaxHighlighting;
        }
        if (jsonObject.syntaxHighlightingThemeLight !== undefined) {
            this.syntaxHighlightingThemeLight = jsonObject.syntaxHighlightingThemeLight as BundledTheme;
        } else {
            this.syntaxHighlightingThemeLight = DEFAULT_THEME_LIGHT;
        }
        if (jsonObject.syntaxHighlightingThemeDark !== undefined) {
            this.syntaxHighlightingThemeDark = jsonObject.syntaxHighlightingThemeDark as BundledTheme;
        } else {
            this.syntaxHighlightingThemeDark = DEFAULT_THEME_DARK;
        }
        if (jsonObject.omitPatchHeaderOnlyHunks !== undefined) {
            this.omitPatchHeaderOnlyHunks = jsonObject.omitPatchHeaderOnlyHunks;
        }
        if (jsonObject.wordDiff !== undefined) {
            this.wordDiffs = jsonObject.wordDiff;
        }
        if (jsonObject.lineWrap !== undefined) {
            this.lineWrap = jsonObject.lineWrap;
        }
        if (jsonObject.sidebarLocation !== undefined) {
            this.sidebarLocation = jsonObject.sidebarLocation;
        }
    }
}

import { browser } from "$app/environment";
import { watchLocalStorage } from "$lib/util";
import { MediaQuery } from "svelte/reactivity";

export type Theme = "dark" | "light" | "auto";

// Used indirectly in app.html
const themeKey = "theme";

function initialTheme() {
    if (browser) {
        const storedTheme = localStorage.getItem(themeKey);
        if (storedTheme) {
            return storedTheme as Theme;
        }
    }
    return "auto";
}

let theme: Theme = $state(initialTheme());

const prefersDark = new MediaQuery("prefers-color-scheme: dark");

export function initThemeHooks() {
    watchLocalStorage(themeKey, (newValue) => {
        if (newValue) {
            theme = newValue as Theme;
        }
    });
    $effect(() => document.documentElement.setAttribute("data-theme", theme));
}

export function setGlobalTheme(newTheme: Theme) {
    theme = newTheme;
    localStorage.setItem(themeKey, newTheme);
}

export function getGlobalTheme(): Theme {
    return theme;
}

export function getEffectiveGlobalTheme(): "dark" | "light" {
    if (theme === "auto") {
        return prefersDark.current ? "dark" : "light";
    }
    return theme;
}

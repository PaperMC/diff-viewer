import { onMount } from "svelte";
import { on } from "svelte/events";

export class Keybinds {
    private static readonly IS_MAC = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

    static getModifierKey() {
        return Keybinds.IS_MAC ? "⌘" : "Ctrl";
    }

    private readonly binds = new Map<string, () => void>();

    constructor() {
        onMount(() => {
            return on(document, "keydown", (event) => {
                const modifierPressed = Keybinds.IS_MAC ? event.metaKey : event.ctrlKey;
                if (modifierPressed) {
                    const bindAction = this.binds.get(event.key.toLowerCase());
                    if (bindAction) {
                        bindAction();
                        event.preventDefault();
                    }
                }
            });
        });
    }

    registerModifierBind(key: string, action: () => void) {
        this.binds.set(key.toLowerCase(), action);
    }
}

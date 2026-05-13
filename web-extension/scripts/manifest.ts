import type { Manifest } from "webextension-polyfill";
import { writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import pkg from "../package.json" with { type: "json" };

const firefox = process.env.EXTENSION === "firefox";

await writeManifest();

async function writeManifest() {
    const manifest = makeManifest();
    const path = "public/manifest.json";
    if (existsSync(path)) {
        await unlink(path);
    }
    const manifestString = JSON.stringify(manifest, null, 2);
    await writeFile(path, manifestString);
}

function makeManifest(): Manifest.WebExtensionManifest {
    return {
        manifest_version: 3,
        name: pkg.displayName,
        version: pkg.version,
        description: pkg.description,
        permissions: ["tabs", "storage", "contextMenus"],
        icons: {
            "128": "favicon.png",
        },
        action: {
            default_title: pkg.displayName,
            default_icon: {
                "128": "favicon.png",
            },
            default_popup: "popup.html",
        },
        background: firefox
            ? {
                  scripts: ["worker.js"],
                  type: "module",
              }
            : {
                  service_worker: "worker.js",
                  type: "module",
              },
        options_ui: {
            page: "options.html",
            open_in_tab: true,
        },
        browser_specific_settings: {
            gecko: {
                id: "patch-roulette@papermc.io",
            },
        },
    };
}

import { openInPatchRoulette } from "./common.ts";
import browser from "webextension-polyfill";

function createContextMenu() {
    browser.contextMenus.create({
        id: "open-in-patch-roulette",
        title: "Open in Patch Roulette Diff Viewer",
        contexts: ["all"],
    });
}

browser.runtime.onStartup.addListener(createContextMenu);
browser.runtime.onInstalled.addListener(createContextMenu);

browser.contextMenus.onClicked.addListener(async (info, tab) => {
    let url = info.linkUrl || info.srcUrl || info.selectionText || info.frameUrl || info.pageUrl;
    if (!url && tab && tab.url) {
        url = tab.url;
    }
    if (url) {
        await openInPatchRoulette(url);
    }
});

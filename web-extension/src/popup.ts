import { getActiveTab, openInDiffViewer } from "./common.ts";

const button = document.getElementById("open-button") as HTMLButtonElement;
const settingsButton = document.getElementById("settings-button") as HTMLButtonElement;

if (!button || !settingsButton) {
    throw new Error("Element not found");
}

button.addEventListener("click", async () => {
    const activeTab = await getActiveTab();
    if (activeTab && activeTab.url) {
        await openInDiffViewer(activeTab.url);
        window.close();
    }
});

settingsButton.addEventListener("click", async () => {
    await chrome.runtime.openOptionsPage();
    window.close();
});

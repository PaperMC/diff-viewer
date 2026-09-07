import { defaultViewerUrl, getViewerUrl } from "./common.ts";

const input = document.getElementById("url-input") as HTMLInputElement;

if (!input) {
  throw new Error("Element not found");
}

input.placeholder = defaultViewerUrl;
input.value = await getViewerUrl();

input.addEventListener("change", async (event) => {
  const newUrl = (event.target as HTMLInputElement).value || defaultViewerUrl;
  if (newUrl === defaultViewerUrl) {
    await chrome.storage.sync.remove("url");
  } else {
    await chrome.storage.sync.set({ url: newUrl });
  }
});

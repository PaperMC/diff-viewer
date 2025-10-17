<script lang="ts">
    import { MultiFileDiffViewerState } from "$lib/diff-viewer-multi-file.svelte";
    import Spinner from "$lib/components/Spinner.svelte";

    const viewer = MultiFileDiffViewerState.get();

    let currentMatchIdx = $state(-1);
    let controlsWidth = $state(0);

    $effect(() => {
        viewer.searchResults.then(() => {}); // Trigger reactivity

        // Reset current match index when search results change
        currentMatchIdx = -1;
    });

    async function prevResult() {
        const files = await viewer.searchResults;
        if (files.totalMatches === 0) {
            currentMatchIdx = -1;
            return;
        }
        const startIdx = currentMatchIdx == -1 ? 0 : currentMatchIdx;
        currentMatchIdx = (startIdx - 1 + files.totalMatches) % files.totalMatches;
        viewer.activeSearchResult = files.getLocation(currentMatchIdx);
        await scrollToMatch();
    }

    async function nextResult() {
        const files = await viewer.searchResults;
        if (files.totalMatches === 0) {
            currentMatchIdx = -1;
            return;
        }
        currentMatchIdx = (currentMatchIdx + 1) % files.totalMatches;
        viewer.activeSearchResult = files.getLocation(currentMatchIdx);
        await scrollToMatch();
    }

    async function scrollToMatch() {
        const files = await viewer.searchResults;
        if (currentMatchIdx >= 0 && currentMatchIdx < files.totalMatches) {
            const { file, idx } = files.getLocation(currentMatchIdx);
            await viewer.scrollToMatch(file, idx);
        }
    }

    function currentMatchIdForDisplay(): string {
        const id = currentMatchIdx + 1;
        if (id === 0) {
            return "-";
        }
        return id.toString();
    }
</script>

<div class="relative ms-auto flex max-w-96 grow">
    <input
        type="text"
        placeholder="Search diff content..."
        bind:value={viewer.searchQuery}
        class="w-full rounded-md border py-0.5 ps-6 text-sm overflow-ellipsis focus:ring-2 focus:ring-primary focus:outline-none"
        autocomplete="off"
        style="padding-inline-end: {0.5 + controlsWidth / 16}rem;"
    />
    <span aria-hidden="true" class="absolute top-1/2 left-1 iconify size-4 -translate-y-1/2 text-em-med octicon--search-16"></span>
    <div class="absolute top-1/2 right-1 flex -translate-y-1/2 flex-row" bind:clientWidth={controlsWidth}>
        {#if viewer.searchQueryDebounced.current}
            {#await viewer.searchResults}
                <Spinner size={4}></Spinner>
            {:then files}
                <span class="text-sm">{`${currentMatchIdForDisplay()} / ${files.totalMatches}`}</span>
                <button class="flex size-5 items-center justify-center" onclick={() => prevResult()} aria-label="previous match">
                    <span class="flex size-4 items-center justify-center rounded-sm btn-ghost">
                        <span aria-hidden="true" class="iconify size-4 octicon--chevron-left-16"></span>
                    </span>
                </button>
                <button class="flex size-5 items-center justify-center" onclick={() => nextResult()} aria-label="next match">
                    <span class="flex size-4 items-center justify-center rounded-sm btn-ghost">
                        <span aria-hidden="true" class="iconify size-4 octicon--chevron-right-16"></span>
                    </span>
                </button>
            {/await}
        {/if}
    </div>
</div>

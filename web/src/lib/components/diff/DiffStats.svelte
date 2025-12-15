<script lang="ts">
    import { Tooltip } from "bits-ui";

    let { remove = 0, add = 0, brief = false }: { remove?: number; add?: number; brief?: boolean } = $props();

    function getAddBarPercentage() {
        if (add === 0) {
            return "0%";
        }
        return (add / (add + remove)) * 100 + "%";
    }

    function getAddBarStyle() {
        if (add === 0) {
            return "display: none;";
        }
        return `width: ${getAddBarPercentage()};`;
    }

    function getRemoveBarPercentage() {
        if (remove === 0) {
            return "0%";
        }
        return (remove / (add + remove)) * 100 + "%";
    }

    function getRemoveBarStyle() {
        if (remove === 0) {
            return "display: none;";
        }
        return `width: ${getRemoveBarPercentage()}; left: ${getAddBarPercentage()};`;
    }

    function getAddRemoveRatio() {
        return getRatio(add, remove);
    }

    /**
     * Calculates the ratio of two numbers a and b, scaled to a given base and rounded to two decimal places.
     *
     * @param a first number
     * @param b second number
     * @param base base to scale the ratio
     */
    function getRatio(a: number, b: number, base: number = 10): [string, string] {
        if (a === 0 && b === 0) return ["0", "0"];
        if (a === 0) return ["0", b.toString()];
        if (b === 0) return [a.toString(), "0"];

        const larger = Math.max(Math.abs(a), Math.abs(b));
        const ratioA = (a / larger) * base;
        const ratioB = (b / larger) * base;

        const formatNumber = (num: number) => (Math.round(num * 100) / 100).toString();
        return [formatNumber(ratioA), formatNumber(ratioB)];
    }
</script>

{#snippet counts()}
    <span class="text-sm text-green-600 dark:text-green-400">+{add.toLocaleString()}</span>
    <span class="text-sm text-red-600 dark:text-red-400">-{remove.toLocaleString()}</span>
{/snippet}

{#snippet ratio()}
    {@const [ratioAdd, ratioRemove] = getAddRemoveRatio()}
    <span class="text-green-600 dark:text-green-400">+{ratioAdd}</span>:<span class="text-red-600 dark:text-red-400">-{ratioRemove}</span>
{/snippet}

<div class="flex flex-row items-center gap-1">
    {#if !brief}
        {@render counts()}
    {/if}
    <Tooltip.Root>
        <Tooltip.Trigger>
            <div class="relative h-3 w-12 bg-neutral-2">
                {#if add === 0 && remove === 0}
                    <div class="absolute top-0 left-0 h-3 w-full border"></div>
                {:else}
                    <div
                        class="absolute top-0 left-0 h-3 border border-green-700 bg-green-600 dark:border-green-600 dark:bg-green-400"
                        style={getAddBarStyle()}
                    ></div>
                    <div class="absolute top-0 h-3 border border-red-700 bg-red-600 dark:border-red-600 dark:bg-red-400" style={getRemoveBarStyle()}></div>
                {/if}
            </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
            <Tooltip.Content class="z-50 rounded-sm border bg-neutral px-1 py-0.5 text-sm shadow-sm">
                {#if brief}
                    {@render counts()} <span class="text-em-med">({@render ratio()})</span>
                {:else}
                    {@render ratio()}
                {/if}
            </Tooltip.Content>
        </Tooltip.Portal>
    </Tooltip.Root>
</div>

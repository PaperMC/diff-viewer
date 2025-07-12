<script lang="ts">
    import { marked } from "marked";
    import DOMPurify from "dompurify";
    import SuggestionDiff from "./SuggestionDiff.svelte";

    interface Props {
        content: string;
        class?: string;
        originalContentForSuggestion?: string;
        startLine?: number;
    }

    let { content, class: className = "", originalContentForSuggestion = "", startLine }: Props = $props();

    const parts = $derived.by(() => {
        if (!content) return [];
        const regex = /(```suggestion\n)([\s\S]*?)```/g;
        const result: { type: "markdown" | "suggestion"; text: string }[] = [];
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(content)) !== null) {
            if (match.index > lastIndex) {
                result.push({ type: "markdown", text: content.substring(lastIndex, match.index) });
            }
            result.push({ type: "suggestion", text: match[2] });
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < content.length) {
            result.push({ type: "markdown", text: content.substring(lastIndex) });
        }

        return result.length > 0 ? result : [{ type: "markdown", text: content }];
    });

    function renderMarkdown(markdown: string): string {
        if (!markdown.trim()) return "";
        const rawHtml = marked(markdown) as string;
        return DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: [
                "p",
                "br",
                "strong",
                "em",
                "u",
                "code",
                "pre",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "blockquote",
                "ul",
                "ol",
                "li",
                "a",
                "img",
                "table",
                "thead",
                "tbody",
                "tr",
                "td",
                "th",
                "div",
                "span",
                "del",
                "ins",
                "hr",
            ],
            ALLOWED_ATTR: ["href", "title", "alt", "src", "class", "id", "target", "rel"],
            ALLOW_DATA_ATTR: false,
            FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"],
            FORBID_ATTR: ["onclick", "onload", "onerror", "onmouseover", "onfocus", "onblur"],
        });
    }
</script>

<div class="markdown-content {className}">
    {#each parts as part, index (index)}
        {#if part.type === "markdown"}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- protected by dompurify -->
            {@html renderMarkdown(part.text)}
        {:else if part.type === "suggestion"}
            <SuggestionDiff originalContent={originalContentForSuggestion} suggestedContent={part.text} {startLine} />
        {/if}
    {/each}
</div>

<style>
    .markdown-content {
        font-size: 0.75rem;
        line-height: 1.4;
        word-wrap: break-word;
        color: var(--color-em-high);
    }

    .markdown-content :global(p) {
        margin: 0 0 8px 0;
    }

    .markdown-content :global(p:last-child) {
        margin-bottom: 0;
    }

    .markdown-content :global(h1),
    .markdown-content :global(h2),
    .markdown-content :global(h3),
    .markdown-content :global(h4),
    .markdown-content :global(h5),
    .markdown-content :global(h6) {
        margin: 12px 0 8px 0;
        font-weight: 600;
        line-height: 1.2;
        color: var(--color-em-high);
    }

    .markdown-content :global(h1) {
        font-size: 1.2rem;
    }
    .markdown-content :global(h2) {
        font-size: 1.1rem;
    }
    .markdown-content :global(h3) {
        font-size: 1rem;
    }
    .markdown-content :global(h4) {
        font-size: 0.9rem;
    }
    .markdown-content :global(h5) {
        font-size: 0.85rem;
    }
    .markdown-content :global(h6) {
        font-size: 0.8rem;
    }

    .markdown-content :global(strong) {
        font-weight: 600;
    }

    .markdown-content :global(em) {
        font-style: italic;
    }

    .markdown-content :global(code) {
        background: var(--color-neutral-2);
        padding: 2px 4px;
        border-radius: 2px;
        font-family: var(--font-mono);
        font-size: 0.7rem;
        border: 1px solid var(--color-border);
        color: var(--color-em-high);
    }

    .markdown-content :global(pre) {
        background: var(--color-neutral-2);
        border: 1px solid var(--color-border);
        border-radius: 3px;
        padding: 8px 12px;
        margin: 8px 0;
        overflow-x: auto;
        color: var(--color-em-high);
    }

    .markdown-content :global(pre > code) {
        background: none;
        padding: 0;
        border: none;
        font-size: inherit;
        color: inherit;
    }

    .markdown-content :global(blockquote) {
        border-left: 3px solid var(--color-border);
        padding-left: 12px;
        margin: 8px 0;
        color: var(--color-em-med);
        font-style: italic;
    }

    .markdown-content :global(ul),
    .markdown-content :global(ol) {
        margin: 8px 0;
        padding-left: 20px;
    }

    .markdown-content :global(li) {
        margin: 2px 0;
    }

    .markdown-content :global(table) {
        border-collapse: collapse;
        margin: 8px 0;
        width: 100%;
        font-size: 0.7rem;
    }

    .markdown-content :global(th),
    .markdown-content :global(td) {
        border: 1px solid var(--color-border);
        padding: 4px 8px;
        text-align: left;
        color: var(--color-em-high);
    }

    .markdown-content :global(th) {
        background: var(--color-neutral-2);
        font-weight: 600;
    }

    .markdown-content :global(a) {
        color: var(--color-primary);
        text-decoration: none;
    }

    .markdown-content :global(a:hover) {
        text-decoration: underline;
    }

    .markdown-content :global(img) {
        max-width: 100%;
        height: auto;
        border-radius: 2px;
        border: 1px solid var(--color-border);
    }

    .markdown-content :global(hr) {
        border: none;
        border-top: 1px solid var(--color-border);
        margin: 12px 0;
    }

    .markdown-content :global(del) {
        text-decoration: line-through;
        color: var(--color-em-med);
    }

    .markdown-content :global(ins) {
        text-decoration: none;
        background: var(--color-green-100);
        padding: 1px 2px;
        border-radius: 2px;
        color: var(--color-green-800);
    }

    @variant dark {
        .markdown-content :global(ins) {
            background: var(--color-green-900);
            color: var(--color-green-200);
        }
    }
</style>

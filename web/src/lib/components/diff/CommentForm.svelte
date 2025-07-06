<script lang="ts">
    import { type CommentFormProps, CommentFormState } from "./comment-state.svelte";
    import type { GithubPRComment } from "$lib/github.svelte";

    interface Props {
        owner: string;
        repo: string;
        prNumber: string;
        path?: string;
        line?: number;
        side?: "LEFT" | "RIGHT";
        startLine?: number;
        startSide?: "LEFT" | "RIGHT";
        replyToId?: number;
        placeholder?: string;
        selectedContent?: string;
        disableSuggestions?: boolean;
        onSubmit?: (comment: GithubPRComment) => void;
        onCancel?: () => void;
    }

    let {
        owner,
        repo,
        prNumber,
        path,
        line,
        side = "RIGHT",
        startLine,
        startSide,
        replyToId,
        placeholder = "Add a comment...",
        selectedContent = "",
        disableSuggestions = false,
        onSubmit,
        onCancel,
    }: Props = $props();

    const formProps: CommentFormProps = {
        owner,
        repo,
        prNumber,
        path,
        line,
        side,
        startLine,
        startSide,
        replyToId,
        placeholder,
    };

    const formState = new CommentFormState(formProps, onSubmit, onCancel);

    let textareaRef: HTMLTextAreaElement;

    function autoResizeTextarea() {
        if (!textareaRef) return;

        // Reset height to auto to get the correct scrollHeight
        textareaRef.style.height = "auto";

        // Calculate new height based on content
        const minHeight = 48; // Minimum height in pixels
        const maxHeight = 300; // Maximum height in pixels
        const scrollHeight = textareaRef.scrollHeight;

        // Set new height within bounds
        const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
        textareaRef.style.height = `${newHeight}px`;
    }

    function insertAtCursor(before: string, after: string = "") {
        if (!textareaRef) return;

        const start = textareaRef.selectionStart;
        const end = textareaRef.selectionEnd;
        const selectedText = formState.text.substring(start, end);

        formState.text = formState.text.substring(0, start) + before + selectedText + after + formState.text.substring(end);

        // Set cursor position and auto-resize
        setTimeout(() => {
            textareaRef.focus();
            textareaRef.setSelectionRange(start + before.length, start + before.length + selectedText.length);
            autoResizeTextarea();
        }, 0);
    }

    // Auto-resize on mount
    $effect(() => {
        if (textareaRef) {
            autoResizeTextarea();
        }
    });

    function handleBold() {
        insertAtCursor("**", "**");
    }

    function handleItalic() {
        insertAtCursor("*", "*");
    }

    function handleCode() {
        insertAtCursor("`", "`");
    }

    function handleQuote() {
        insertAtCursor("> ");
    }

    function handleSuggestion() {
        // Use the fallback only if no content was selected at all
        // Preserve empty lines and whitespace-only lines when they are actually selected
        const content = selectedContent.length > 0 ? selectedContent : "// Your suggested code here";
        const suggestionText = "\n```suggestion\n" + content + "\n```\n";
        insertAtCursor(suggestionText);
    }
</script>

<div class="comment-form">
    {#if formState.error}
        <div class="error-message">
            {formState.error}
        </div>
    {/if}

    {#if formState.isMultilineComment}
        <div class="multiline-indicator">
            <span class="iconify octicon--diff-16"></span>
            Commenting on lines {formState.orderedLines.startLine}-{formState.orderedLines.endLine} ({formState.orderedLines.startSide ===
            formState.orderedLines.endSide
                ? formState.orderedLines.endSide
                : `${formState.orderedLines.startSide} to ${formState.orderedLines.endSide}`})
        </div>
    {/if}

    <div class="textarea-container">
        <div class="markdown-toolbar">
            <button type="button" class="toolbar-button" title="Bold" onclick={handleBold}>
                <span class="iconify octicon--bold-16"></span>
            </button>
            <button type="button" class="toolbar-button" title="Italic" onclick={handleItalic}>
                <span class="iconify octicon--italic-16"></span>
            </button>
            <button type="button" class="toolbar-button" title="Code" onclick={handleCode}>
                <span class="iconify octicon--code-16"></span>
            </button>
            <button type="button" class="toolbar-button" title="Quote" onclick={handleQuote}>
                <span class="iconify octicon--quote-16"></span>
            </button>
            <div class="toolbar-divider"></div>
            <button type="button" class="toolbar-button suggestion-button" title="Insert Suggestion" onclick={handleSuggestion} disabled={disableSuggestions}>
                <span class="iconify octicon--light-bulb-16"></span>
                <span class="toolbar-label">Suggestion</span>
            </button>
        </div>
        <textarea
            bind:this={textareaRef}
            bind:value={formState.text}
            {placeholder}
            rows="3"
            class="comment-textarea"
            disabled={formState.isSubmitting}
            onkeydown={formState.handleKeyDown}
            oninput={autoResizeTextarea}
        ></textarea>
    </div>

    <div class="form-actions">
        <div class="form-hint">
            <span class="iconify octicon--info-16"></span>
            Use Cmd/Ctrl + Enter to submit
        </div>

        <div class="button-group">
            {#if onCancel}
                <button type="button" class="cancel-button" onclick={formState.cancel} disabled={formState.isSubmitting}> Cancel </button>
            {/if}

            <button type="button" class="submit-button" onclick={formState.submit} disabled={!formState.canSubmit}>
                {#if formState.isSubmitting}
                    <span class="spinning iconify octicon--sync-16"></span>
                    {formState.isReply ? "Replying..." : "Commenting..."}
                {:else}
                    {formState.isReply ? "Reply" : "Comment"}
                {/if}
            </button>
        </div>
    </div>
</div>

<style>
    .comment-form {
        background: var(--color-neutral-1);
        border: 1px solid var(--color-border);
        border-radius: 3px;
        padding: 4px 6px;
        margin: 2px 0;
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .error-message {
        background: var(--color-red-100);
        border: 1px solid var(--color-red-300);
        color: var(--color-red-700);
        padding: 4px 8px;
        border-radius: 2px;
        margin-bottom: 8px;
        font-size: 0.6875rem;
    }

    .multiline-indicator {
        background: var(--color-blue-50);
        border: 1px solid var(--color-blue-200);
        color: var(--color-blue-700);
        padding: 4px 8px;
        border-radius: 2px;
        margin-bottom: 8px;
        font-size: 0.6875rem;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    @variant dark {
        .multiline-indicator {
            background: var(--color-blue-900);
            border-color: var(--color-blue-700);
            color: var(--color-blue-300);
        }
    }

    .textarea-container {
        display: flex;
        flex-direction: column;
        border: 1px solid var(--color-border);
        border-radius: 2px;
        overflow: hidden;
        background: var(--color-neutral);
    }

    .textarea-container:focus-within {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 1px var(--color-primary-20);
    }

    .markdown-toolbar {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 4px 6px;
        background: var(--color-neutral-2);
        border-bottom: 1px solid var(--color-border);
    }

    .toolbar-button {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 2px 4px;
        border: none;
        background: none;
        border-radius: 2px;
        cursor: pointer;
        color: var(--color-em-med);
        font-size: 0.7rem;
        transition: all 0.2s;
    }

    .toolbar-button:hover {
        background: var(--color-neutral-3);
        color: var(--color-em-high);
    }

    .toolbar-button:active {
        background: var(--color-neutral-4);
    }

    .toolbar-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .toolbar-button.suggestion-button {
        color: var(--color-blue-600);
    }

    .toolbar-button.suggestion-button:hover {
        background: var(--color-blue-100);
        color: var(--color-blue-700);
    }

    .toolbar-label {
        font-size: 0.6875rem;
        font-weight: 500;
    }

    .toolbar-divider {
        width: 1px;
        height: 16px;
        background: var(--color-border);
        margin: 0 4px;
    }

    .comment-textarea {
        width: 100%;
        height: 48px;
        padding: 6px 8px;
        border: none;
        border-radius: 0;
        font-family: inherit;
        font-size: 0.75rem;
        line-height: 1.3;
        resize: none;
        overflow-y: auto;
        background: var(--color-neutral);
        color: var(--color-em-high);
    }

    .comment-textarea:focus {
        outline: none;
    }

    .comment-textarea:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .form-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 4px;
    }

    .form-hint {
        display: flex;
        align-items: center;
        gap: 3px;
        color: var(--color-em-med);
        font-size: 0.6875rem;
    }

    .button-group {
        display: flex;
        gap: 6px;
    }

    .cancel-button {
        background: none;
        border: 1px solid var(--color-border);
        color: var(--color-em-high);
        padding: 4px 8px;
        border-radius: 2px;
        cursor: pointer;
        font-size: 0.6875rem;
        transition: all 0.2s;
    }

    .cancel-button:hover:not(:disabled) {
        background: var(--color-neutral-2);
    }

    .cancel-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .submit-button {
        background: var(--color-primary);
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 2px;
        cursor: pointer;
        font-size: 0.6875rem;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 3px;
    }

    .submit-button:hover:not(:disabled) {
        background: var(--color-primary-hover);
    }

    .submit-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .spinning {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
</style>

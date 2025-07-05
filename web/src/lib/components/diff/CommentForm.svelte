<script lang="ts">
    import { CommentFormState, type CommentFormProps } from "./comment-state.svelte";
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
            Commenting on lines {formState.orderedLines.startLine}-{formState.orderedLines.endLine} ({formState.orderedLines.startSide === formState.orderedLines.endSide
                ? formState.orderedLines.endSide
                : `${formState.orderedLines.startSide} to ${formState.orderedLines.endSide}`})
        </div>
    {/if}

    <textarea bind:value={formState.text} {placeholder} rows="3" class="comment-textarea" disabled={formState.isSubmitting} onkeydown={formState.handleKeyDown}></textarea>

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

    .comment-textarea {
        width: 100%;
        min-height: 48px;
        padding: 6px 8px;
        border: 1px solid var(--color-border);
        border-radius: 2px;
        font-family: inherit;
        font-size: 0.75rem;
        line-height: 1.3;
        resize: vertical;
        background: var(--color-neutral);
        color: var(--color-em-high);
    }

    .comment-textarea:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 1px var(--color-primary-20);
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

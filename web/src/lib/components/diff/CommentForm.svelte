<script lang="ts">
    import { createGithubPRComment, replyToGithubPRComment, getGithubToken, type GithubPRComment } from "$lib/github.svelte";

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

    let commentText = $state("");
    let isSubmitting = $state(false);
    let error = $state<string | null>(null);

    const canSubmit = $derived(commentText.trim().length > 0 && !isSubmitting);
    const isReply = $derived(!!replyToId);
    const isMultilineComment = $derived(!isReply && startLine !== undefined && startSide !== undefined && startLine !== line);

    // Ensure correct line ordering for GitHub API
    const orderedLines = $derived.by(() => {
        if (!isMultilineComment || startLine === undefined || startSide === undefined || line === undefined) {
            return { startLine, startSide, endLine: line, endSide: side };
        }

        // GitHub API requires start_line < line
        if (startLine < line) {
            return { startLine, startSide, endLine: line, endSide: side };
        } else if (startLine > line) {
            return { startLine: line, startSide: side, endLine: startLine, endSide: startSide };
        } else {
            // Same line number - order by side (LEFT before RIGHT)
            if (startSide === "LEFT" && side === "RIGHT") {
                return { startLine, startSide, endLine: line, endSide: side };
            } else {
                return { startLine: line, startSide: side, endLine: startLine, endSide: startSide };
            }
        }
    });

    async function handleSubmit() {
        if (!canSubmit) return;

        const token = getGithubToken();
        if (!token) {
            error = "Authentication required to post comments";
            return;
        }

        isSubmitting = true;
        error = null;

        try {
            let comment: GithubPRComment;

            if (isReply) {
                comment = await replyToGithubPRComment(token, owner, repo, prNumber, replyToId!, commentText.trim());
            } else {
                if (!path || line === undefined || !side) {
                    throw new Error("Path, line, and side are required for new comments");
                }

                if (orderedLines.endLine === undefined) {
                    throw new Error("End line is required for new comments");
                }

                comment = await createGithubPRComment(
                    token,
                    owner,
                    repo,
                    prNumber,
                    commentText.trim(),
                    path,
                    orderedLines.endLine,
                    orderedLines.endSide,
                    orderedLines.startLine,
                    orderedLines.startSide,
                );
            }

            commentText = "";
            onSubmit?.(comment);
        } catch (err) {
            error = err instanceof Error ? err.message : "Failed to post comment";
        } finally {
            isSubmitting = false;
        }
    }

    function handleCancel() {
        commentText = "";
        error = null;
        onCancel?.();
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            handleSubmit();
        }
    }
</script>

<div class="comment-form">
    {#if error}
        <div class="error-message">
            {error}
        </div>
    {/if}

    {#if isMultilineComment}
        <div class="multiline-indicator">
            <span class="iconify octicon--diff-16"></span>
            Commenting on lines {orderedLines.startLine}-{orderedLines.endLine} ({orderedLines.startSide === orderedLines.endSide
                ? orderedLines.endSide
                : `${orderedLines.startSide} to ${orderedLines.endSide}`})
        </div>
    {/if}

    <textarea bind:value={commentText} {placeholder} rows="3" class="comment-textarea" disabled={isSubmitting} onkeydown={handleKeyDown}></textarea>

    <div class="form-actions">
        <div class="form-hint">
            <span class="iconify octicon--info-16"></span>
            Use Cmd/Ctrl + Enter to submit
        </div>

        <div class="button-group">
            {#if onCancel}
                <button type="button" class="cancel-button" onclick={handleCancel} disabled={isSubmitting}> Cancel </button>
            {/if}

            <button type="button" class="submit-button" onclick={handleSubmit} disabled={!canSubmit}>
                {#if isSubmitting}
                    <span class="spinning iconify octicon--sync-16"></span>
                    {isReply ? "Replying..." : "Commenting..."}
                {:else}
                    {isReply ? "Reply" : "Comment"}
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

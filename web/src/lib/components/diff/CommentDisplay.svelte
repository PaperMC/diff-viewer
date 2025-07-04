<script lang="ts">
    import type { GithubPRComment } from "$lib/github.svelte";
    import { formatDistance } from "date-fns";
    import { getGithubUsername, getGithubToken, updateGithubPRComment, deleteGithubPRComment } from "$lib/github.svelte";

    interface Props {
        comment: GithubPRComment;
        isReply?: boolean;
        owner: string;
        repo: string;
        onCommentUpdated?: (comment: GithubPRComment) => void;
        onCommentDeleted?: (commentId: number) => void;
    }

    let { comment, isReply = false, owner, repo, onCommentUpdated, onCommentDeleted }: Props = $props();

    let isEditing = $state(false);
    let editText = $state("");
    let isSubmitting = $state(false);
    let error = $state<string | null>(null);
    let isDeleting = $state(false);

    const currentUser = $derived(getGithubUsername());
    const hasToken = $derived(!!getGithubToken());
    const canEdit = $derived(hasToken && currentUser === comment.user.login);
    const canDelete = $derived(hasToken && currentUser === comment.user.login);

    function formatTimestamp(dateString: string): string {
        const date = new Date(dateString);
        return formatDistance(date, new Date(), { addSuffix: true });
    }

    function startEdit() {
        isEditing = true;
        editText = comment.body;
        error = null;
    }

    function cancelEdit() {
        isEditing = false;
        editText = "";
        error = null;
    }

    async function saveEdit() {
        if (!editText.trim()) {
            error = "Comment cannot be empty";
            return;
        }

        const token = getGithubToken();
        if (!token) {
            error = "Authentication required to edit comments";
            return;
        }

        isSubmitting = true;
        error = null;

        try {
            const updatedComment = await updateGithubPRComment(token, owner, repo, comment.id, editText.trim());
            onCommentUpdated?.(updatedComment);
            isEditing = false;
            editText = "";
        } catch (err) {
            error = err instanceof Error ? err.message : "Failed to update comment";
        } finally {
            isSubmitting = false;
        }
    }

    async function deleteComment() {
        if (!confirm("Are you sure you want to delete this comment?")) {
            return;
        }

        const token = getGithubToken();
        if (!token) {
            error = "Authentication required to delete comments";
            return;
        }

        isDeleting = true;
        error = null;

        try {
            await deleteGithubPRComment(token, owner, repo, comment.id);
            onCommentDeleted?.(comment.id);
        } catch (err) {
            error = err instanceof Error ? err.message : "Failed to delete comment";
        } finally {
            isDeleting = false;
        }
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            saveEdit();
        }
        if (event.key === "Escape") {
            cancelEdit();
        }
    }
</script>

<div class="comment-display" class:is-reply={isReply}>
    <div class="comment-header">
        <img src={comment.user.avatar_url} alt={comment.user.login} class="avatar" />
        <div class="comment-meta">
            <a href={comment.user.html_url} target="_blank" rel="noopener noreferrer" class="username">
                {comment.user.login}
            </a>
            <span class="timestamp">
                {formatTimestamp(comment.created_at)}
            </span>
            {#if comment.created_at !== comment.updated_at}
                <span class="edited-indicator"> (edited) </span>
            {/if}
            {#if comment.html_url}
                <div class="github-link">
                    •
                    <a href={comment.html_url} target="_blank" rel="noopener noreferrer" class="view-on-github"> View on GitHub </a>
                </div>
            {/if}
        </div>

        {#if (canEdit || canDelete) && !isEditing}
            <div class="comment-actions">
                {#if canEdit}
                    <button class="action-button edit-button" aria-label="Edit" onclick={startEdit} disabled={isDeleting}>
                        <span class="iconify octicon--pencil-16"></span>
                    </button>
                {/if}
                {#if canDelete}
                    <button class="action-button delete-button" aria-label="Delete" onclick={deleteComment} disabled={isDeleting}>
                        {#if isDeleting}
                            <span class="spinning iconify octicon--sync-16"></span>
                        {:else}
                            <span class="iconify octicon--trash-16"></span>
                        {/if}
                    </button>
                {/if}
            </div>
        {/if}
    </div>

    {#if error}
        <div class="error-message">
            {error}
        </div>
    {/if}

    {#if isEditing}
        <div class="edit-form">
            <textarea bind:value={editText} class="edit-textarea" rows="3" disabled={isSubmitting} onkeydown={handleKeyDown}></textarea>
            <div class="edit-actions">
                <div class="edit-hint">
                    <span class="iconify octicon--info-16"></span>
                    Use Cmd/Ctrl + Enter to save, Escape to cancel
                </div>
                <div class="button-group">
                    <button class="cancel-button" onclick={cancelEdit} disabled={isSubmitting}> Cancel </button>
                    <button class="save-button" onclick={saveEdit} disabled={isSubmitting || !editText.trim()}>
                        {#if isSubmitting}
                            <span class="spinning iconify octicon--sync-16"></span>
                            Saving...
                        {:else}
                            Save
                        {/if}
                    </button>
                </div>
            </div>
        </div>
    {:else}
        <div class="comment-body">
            <p>{comment.body}</p>
        </div>
    {/if}
</div>

<style>
    .comment-display {
        background: var(--color-neutral-2);
        border: 1px solid var(--color-border);
        border-radius: 3px;
        padding: 3px 6px;
        margin-bottom: 2px;
        font-size: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .comment-display.is-reply {
        margin-left: 8px;
        background: var(--color-neutral-1);
        border-left: 2px solid var(--color-border);
        border-radius: 0 3px 3px 0;
    }

    .comment-header {
        display: flex;
        align-items: center;
    }

    .avatar {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        margin-right: 4px;
    }

    .comment-meta {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 1;
    }

    .username {
        font-weight: 600;
        color: var(--color-blue-600);
        text-decoration: none;
        font-size: 0.75rem;
    }

    .username:hover {
        text-decoration: underline;
    }

    .timestamp {
        color: var(--color-em-med);
        font-size: 0.6875rem;
    }

    .edited-indicator {
        color: var(--color-em-med);
        font-size: 0.6875rem;
        font-style: italic;
    }

    .comment-actions {
        display: flex;
        gap: 2px;
        opacity: 0.7;
        transition: opacity 0.2s;
    }

    .comment-display:hover .comment-actions {
        opacity: 1;
    }

    .action-button {
        background: none;
        border: 1px solid var(--color-border);
        border-radius: 2px;
        padding: 2px 4px;
        cursor: pointer;
        color: var(--color-em-med);
        font-size: 10px;
        transition: all 0.2s;
    }

    .action-button:hover:not(:disabled) {
        background: var(--color-neutral-3);
        color: var(--color-em-high);
    }

    .action-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .edit-button:hover:not(:disabled) {
        border-color: var(--color-blue-400);
        color: var(--color-blue-600);
    }

    .delete-button:hover:not(:disabled) {
        border-color: var(--color-red-400);
        color: var(--color-red-600);
    }

    .error-message {
        background: var(--color-red-100);
        border: 1px solid var(--color-red-300);
        color: var(--color-red-700);
        padding: 4px 8px;
        border-radius: 2px;
        font-size: 0.6875rem;
        margin-bottom: 4px;
    }

    .edit-form {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .edit-textarea {
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

    .edit-textarea:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 1px var(--color-primary-20);
    }

    .edit-textarea:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .edit-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .edit-hint {
        display: flex;
        align-items: center;
        gap: 3px;
        color: var(--color-em-med);
        font-size: 0.6875rem;
    }

    .button-group {
        display: flex;
        gap: 4px;
    }

    .cancel-button {
        background: none;
        border: 1px solid var(--color-border);
        color: var(--color-em-high);
        padding: 3px 6px;
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

    .save-button {
        background: var(--color-primary);
        border: none;
        color: white;
        padding: 3px 6px;
        border-radius: 2px;
        cursor: pointer;
        font-size: 0.6875rem;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 3px;
    }

    .save-button:hover:not(:disabled) {
        background: var(--color-primary-hover);
    }

    .save-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .comment-body {
        margin-bottom: 4px;
    }

    .comment-body p {
        margin: 0;
        line-height: 1.2;
        white-space: pre-wrap;
        font-size: 0.75rem;
    }

    .github-link {
        display: flex;
        justify-content: flex-end;
        margin-top: 2px;
    }

    .view-on-github {
        color: var(--color-blue-600);
        text-decoration: none;
        font-size: 0.6875rem;
        opacity: 0.7;
    }

    .view-on-github:hover {
        text-decoration: underline;
        opacity: 1;
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

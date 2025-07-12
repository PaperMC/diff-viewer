<script lang="ts">
    import type { CommentThread } from "$lib/diff-viewer-multi-file.svelte";
    import { type GithubPRComment } from "$lib/github.svelte";
    import CommentDisplay from "./CommentDisplay.svelte";
    import CommentForm from "./CommentForm.svelte";
    import { CommentThreadState } from "./comment-state.svelte";

    interface Props {
        thread: CommentThread;
        owner: string;
        repo: string;
        prNumber: string;
        onCommentAdded?: (comment: GithubPRComment) => void;
        onCommentUpdated?: (comment: GithubPRComment) => void;
        onCommentDeleted?: (commentId: number) => void;
        originalContentForSuggestion?: string;
    }

    let { thread, owner, repo, prNumber, onCommentAdded, onCommentUpdated, onCommentDeleted, originalContentForSuggestion }: Props = $props();

    const threadState = new CommentThreadState(thread, onCommentAdded, onCommentUpdated, onCommentDeleted);

    // Calculate the starting line for suggestions based on the thread's position
    // For multiline comments, use the start_line; for single-line comments, use the thread's position line
    const startLine = $derived.by(() => {
        const firstComment = threadState.topLevelComments[0];
        if (firstComment && firstComment.start_line !== undefined && firstComment.start_line !== null) {
            return firstComment.start_line;
        }
        return thread.position.line;
    });
</script>

<div class="comment-thread">
    <div class="thread-header">
        <button class="collapse-button" onclick={threadState.toggleCollapse} aria-label={threadState.collapsed ? "Expand comments" : "Collapse comments"}>
            <span class="iconify {threadState.collapsed ? 'octicon--chevron-right-12' : 'octicon--chevron-down-12'}"></span>
            <span class="comment-count">
                {thread.comments.length} comment{thread.comments.length !== 1 ? "s" : ""}
            </span>
        </button>

        <div class="thread-position">
            {thread.position.path}:{threadState.lineRangeDisplay} ({threadState.sideDisplay})
        </div>
    </div>
    {#if !threadState.collapsed}
        <div class="thread-content">
            <!-- Top-level comments -->
            {#each threadState.topLevelComments as comment (comment.id)}
                <CommentDisplay
                    {comment}
                    {owner}
                    {repo}
                    onCommentUpdated={threadState.handleCommentUpdated}
                    onCommentDeleted={threadState.handleCommentDeleted}
                    {originalContentForSuggestion}
                    {startLine}
                />
            {/each}

            <!-- Replies -->
            {#if threadState.replies.length > 0}
                <div class="replies-section">
                    <div class="replies-header">
                        <span class="replies-label">Replies</span>
                    </div>
                    {#each threadState.replies as reply (reply.id)}
                        <CommentDisplay
                            comment={reply}
                            isReply={true}
                            {owner}
                            {repo}
                            onCommentUpdated={threadState.handleCommentUpdated}
                            onCommentDeleted={threadState.handleCommentDeleted}
                            {originalContentForSuggestion}
                            {startLine}
                        />
                    {/each}
                </div>
            {/if}

            <!-- Reply form -->
            {#if threadState.hasToken && threadState.topLevelComments.length > 0}
                <div class="reply-section">
                    {#if threadState.showReplyForm}
                        <CommentForm
                            {owner}
                            {repo}
                            {prNumber}
                            replyToId={threadState.topLevelComments[0].id}
                            placeholder="Add a reply..."
                            onCancel={() => (threadState.showReplyForm = false)}
                            onSubmit={threadState.handleReplyAdded}
                        />
                    {:else}
                        <button class="show-reply-form-button" onclick={() => (threadState.showReplyForm = true)}> Reply </button>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .comment-thread {
        display: flex;
        flex-direction: column;
        gap: 4px;
        background: var(--color-neutral-1);
        border: 1px solid var(--color-border);
        border-radius: 3px;
        margin: 2px 0;
        overflow: hidden;
    }

    .thread-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2px 6px;
        background: var(--color-neutral-2);
        border-bottom: 1px solid var(--color-border);
    }

    .collapse-button {
        display: flex;
        align-items: center;
        gap: 4px;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-em-high);
        font-size: 0.75rem;
        padding: 2px 4px;
        border-radius: 2px;
        transition: background-color 0.2s;
    }

    .collapse-button:hover {
        background: var(--color-neutral-3);
    }

    .collapse-button .iconify {
        transition: transform 0.2s;
        font-size: 10px;
    }

    .comment-count {
        font-weight: 500;
    }

    .thread-position {
        font-size: 0.6875rem;
        color: var(--color-em-med);
        font-family: var(--font-mono);
    }

    .thread-content {
        padding: 3px 6px;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .replies-section {
        margin-top: 1px;
        padding-top: 1px;
        border-top: 1px solid var(--color-border);
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .replies-header {
        margin-bottom: 1px;
    }

    .replies-label {
        font-size: 0.6875rem;
        font-weight: 600;
        color: var(--color-em-med);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .reply-section {
        margin-top: 1px;
        padding-top: 1px;
        border-top: 1px solid var(--color-border);
    }

    .show-reply-form-button {
        background: var(--color-primary);
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 2px;
        cursor: pointer;
        font-size: 0.6875rem;
        transition: background-color 0.2s;
    }

    .show-reply-form-button:hover {
        background: var(--color-primary-hover);
    }
</style>

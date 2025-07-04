<script lang="ts">
    import type { CommentThread } from "$lib/diff-viewer-multi-file.svelte";
    import { getGithubToken, type GithubPRComment } from "$lib/github.svelte";
    import CommentDisplay from "./CommentDisplay.svelte";
    import CommentForm from "./CommentForm.svelte";

    interface Props {
        thread: CommentThread;
        owner: string;
        repo: string;
        prNumber: string;
        onCommentAdded?: (comment: GithubPRComment) => void;
        onCommentUpdated?: (comment: GithubPRComment) => void;
        onCommentDeleted?: (commentId: number) => void;
    }

    let { thread, owner, repo, prNumber, onCommentAdded, onCommentUpdated, onCommentDeleted }: Props = $props();

    let showReplyForm = $state(false);
    let isCollapsed = $state(thread.collapsed);

    const hasToken = $derived(!!getGithubToken());

    // Separate top-level comments from replies
    const topLevelComments = $derived(thread.comments.filter((comment) => !comment.in_reply_to_id));

    const replies = $derived(thread.comments.filter((comment) => comment.in_reply_to_id));

    // Check if this is a multiline comment thread
    const isMultilineThread = $derived.by(() => {
        const firstComment = topLevelComments[0];
        return firstComment && firstComment.start_line !== undefined && firstComment.start_line !== null && firstComment.start_line !== firstComment.line;
    });

    // Get line range display for multiline comments
    const lineRangeDisplay = $derived.by(() => {
        if (!isMultilineThread) {
            return `${thread.position.line}`;
        }

        const firstComment = topLevelComments[0];
        if (!firstComment || firstComment.start_line === undefined || firstComment.start_line === null) {
            return `${thread.position.line}`;
        }

        return `${firstComment.start_line}-${firstComment.line}`;
    });

    // Get side display for multiline comments
    const sideDisplay = $derived.by(() => {
        if (!isMultilineThread) {
            return thread.position.side;
        }

        const firstComment = topLevelComments[0];
        if (!firstComment || firstComment.start_side === undefined || firstComment.start_side === null) {
            return thread.position.side;
        }

        // If both start and end are on the same side, just show the side
        if (firstComment.start_side === firstComment.side) {
            return firstComment.side;
        }

        // If spanning across sides, show the range
        return `${firstComment.start_side} to ${firstComment.side}`;
    });

    function toggleCollapse() {
        isCollapsed = !isCollapsed;
    }

    function handleReplyAdded(comment: GithubPRComment) {
        showReplyForm = false;
        onCommentAdded?.(comment);
    }

    function handleCommentUpdated(comment: GithubPRComment) {
        onCommentUpdated?.(comment);
    }

    function handleCommentDeleted(commentId: number) {
        onCommentDeleted?.(commentId);
    }
</script>

<div class="comment-thread">
    <div class="thread-header">
        <button class="collapse-button" onclick={toggleCollapse} aria-label={isCollapsed ? "Expand comments" : "Collapse comments"}>
            <span class="iconify {isCollapsed ? 'octicon--chevron-right-12' : 'octicon--chevron-down-12'}"></span>
            <span class="comment-count">
                {thread.comments.length} comment{thread.comments.length !== 1 ? "s" : ""}
            </span>
        </button>

        <div class="thread-position">
            {thread.position.path}:{lineRangeDisplay} ({sideDisplay})
        </div>
    </div>

    {#if !isCollapsed}
        <div class="thread-content">
            <!-- Top-level comments -->
            {#each topLevelComments as comment (comment.id)}
                <CommentDisplay {comment} {owner} {repo} onCommentUpdated={handleCommentUpdated} onCommentDeleted={handleCommentDeleted} />
            {/each}

            <!-- Replies -->
            {#if replies.length > 0}
                <div class="replies-section">
                    <div class="replies-header">
                        <span class="replies-label">Replies</span>
                    </div>
                    {#each replies as reply (reply.id)}
                        <CommentDisplay
                            comment={reply}
                            isReply={true}
                            {owner}
                            {repo}
                            onCommentUpdated={handleCommentUpdated}
                            onCommentDeleted={handleCommentDeleted}
                        />
                    {/each}
                </div>
            {/if}

            <!-- Reply form -->
            {#if hasToken && topLevelComments.length > 0}
                <div class="reply-section">
                    {#if showReplyForm}
                        <CommentForm
                            {owner}
                            {repo}
                            {prNumber}
                            replyToId={topLevelComments[0].id}
                            placeholder="Add a reply..."
                            onCancel={() => (showReplyForm = false)}
                            onSubmit={handleReplyAdded}
                        />
                    {:else}
                        <button class="show-reply-form-button" onclick={() => (showReplyForm = true)}> Reply </button>
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

import {
    type GithubPRComment,
    getGithubToken,
    getGithubUsername,
    createGithubPRComment,
    replyToGithubPRComment,
    updateGithubPRComment,
    deleteGithubPRComment,
} from "$lib/github.svelte";
import type { CommentThread } from "$lib/diff-viewer-multi-file.svelte";

export interface CommentFormProps {
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
}

export class CommentFormState {
    text: string = $state("");
    isSubmitting: boolean = $state(false);
    error: string | null = $state(null);

    private readonly props!: CommentFormProps;
    private readonly onSubmit?: (comment: GithubPRComment) => void;
    private readonly onCancel?: () => void;

    readonly canSubmit = $derived(this.text.trim().length > 0 && !this.isSubmitting);
    readonly isReply = $derived(!!this.props.replyToId);
    readonly isMultilineComment = $derived(
        !this.isReply && this.props.startLine !== undefined && this.props.startSide !== undefined && this.props.startLine !== this.props.line,
    );

    constructor(props: CommentFormProps, onSubmit?: (comment: GithubPRComment) => void, onCancel?: () => void) {
        this.props = props;
        this.onSubmit = onSubmit;
        this.onCancel = onCancel;
    }

    // Ensure correct line ordering for GitHub API
    readonly orderedLines = $derived.by(() => {
        if (!this.isMultilineComment || this.props.startLine === undefined || this.props.startSide === undefined || this.props.line === undefined) {
            return {
                startLine: this.props.startLine,
                startSide: this.props.startSide,
                endLine: this.props.line,
                endSide: this.props.side,
            };
        }

        // GitHub API requires start_line < line
        if (this.props.startLine < this.props.line) {
            return {
                startLine: this.props.startLine,
                startSide: this.props.startSide,
                endLine: this.props.line,
                endSide: this.props.side,
            };
        } else if (this.props.startLine > this.props.line) {
            return {
                startLine: this.props.line,
                startSide: this.props.side,
                endLine: this.props.startLine,
                endSide: this.props.startSide,
            };
        } else {
            // Same line number - order by side (LEFT before RIGHT)
            if (this.props.startSide === "LEFT" && this.props.side === "RIGHT") {
                return {
                    startLine: this.props.startLine,
                    startSide: this.props.startSide,
                    endLine: this.props.line,
                    endSide: this.props.side,
                };
            } else {
                return {
                    startLine: this.props.line,
                    startSide: this.props.side,
                    endLine: this.props.startLine,
                    endSide: this.props.startSide,
                };
            }
        }
    });

    submit = async (): Promise<void> => {
        if (!this.canSubmit) return;

        const token = getGithubToken();
        if (!token) {
            this.error = "Authentication required to post comments";
            return;
        }

        this.isSubmitting = true;
        this.error = null;

        try {
            let comment: GithubPRComment;

            if (this.isReply) {
                comment = await replyToGithubPRComment(token, this.props.owner, this.props.repo, this.props.prNumber, this.props.replyToId!, this.text.trim());
            } else {
                if (!this.props.path || this.props.line === undefined || !this.props.side) {
                    throw new Error("Path, line, and side are required for new comments");
                }

                if (this.orderedLines.endLine === undefined) {
                    throw new Error("End line is required for new comments");
                }

                comment = await createGithubPRComment(
                    token,
                    this.props.owner,
                    this.props.repo,
                    this.props.prNumber,
                    this.text.trim(),
                    this.props.path,
                    this.orderedLines.endLine,
                    this.orderedLines.endSide,
                    this.orderedLines.startLine,
                    this.orderedLines.startSide,
                );
            }

            this.text = "";
            this.onSubmit?.(comment);
        } catch (err) {
            if (err instanceof Error) {
                // Handle specific GitHub API validation errors
                if (err.message.includes("start_line must be part of the same hunk as the line")) {
                    this.error = "Multiline comments must be within the same section of the diff. Please select lines within the same hunk.";
                } else if (err.message.includes("Validation Failed") && err.message.includes("pull_request_review_thread")) {
                    this.error = "GitHub API validation error: " + err.message + ". Try selecting lines closer together or within the same diff section.";
                } else {
                    this.error = err.message;
                }
            } else {
                this.error = "Failed to post comment";
            }
        } finally {
            this.isSubmitting = false;
        }
    };

    cancel = (): void => {
        this.text = "";
        this.error = null;
        this.onCancel?.();
    };

    handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            this.submit();
        }
    };
}

export class CommentDisplayState {
    isEditing: boolean = $state(false);
    editText: string = $state("");
    isSubmitting: boolean = $state(false);
    error: string | null = $state(null);
    isDeleting: boolean = $state(false);

    private readonly comment!: GithubPRComment;
    private readonly owner!: string;
    private readonly repo!: string;
    private readonly onUpdated?: (comment: GithubPRComment) => void;
    private readonly onDeleted?: (commentId: number) => void;

    readonly currentUser = $derived(getGithubUsername());
    readonly hasToken = $derived(!!getGithubToken());
    readonly canEdit = $derived(this.hasToken && this.currentUser === this.comment.user.login);
    readonly canDelete = $derived(this.hasToken && this.currentUser === this.comment.user.login);

    constructor(
        comment: GithubPRComment,
        owner: string,
        repo: string,
        onUpdated?: (comment: GithubPRComment) => void,
        onDeleted?: (commentId: number) => void,
    ) {
        this.comment = comment;
        this.owner = owner;
        this.repo = repo;
        this.onUpdated = onUpdated;
        this.onDeleted = onDeleted;
    }

    startEdit = (): void => {
        this.isEditing = true;
        this.editText = this.comment.body;
        this.error = null;
    };

    cancelEdit = (): void => {
        this.isEditing = false;
        this.editText = "";
        this.error = null;
    };

    saveEdit = async (): Promise<void> => {
        if (!this.editText.trim()) {
            this.error = "Comment cannot be empty";
            return;
        }

        const token = getGithubToken();
        if (!token) {
            this.error = "Authentication required to edit comments";
            return;
        }

        this.isSubmitting = true;
        this.error = null;

        try {
            const updatedComment = await updateGithubPRComment(token, this.owner, this.repo, this.comment.id, this.editText.trim());
            this.onUpdated?.(updatedComment);
            this.isEditing = false;
            this.editText = "";
        } catch (err) {
            this.error = err instanceof Error ? err.message : "Failed to update comment";
        } finally {
            this.isSubmitting = false;
        }
    };

    deleteComment = async (): Promise<void> => {
        if (!confirm("Are you sure you want to delete this comment?")) {
            return;
        }

        const token = getGithubToken();
        if (!token) {
            this.error = "Authentication required to delete comments";
            return;
        }

        this.isDeleting = true;
        this.error = null;

        try {
            await deleteGithubPRComment(token, this.owner, this.repo, this.comment.id);
            this.onDeleted?.(this.comment.id);
        } catch (err) {
            this.error = err instanceof Error ? err.message : "Failed to delete comment";
        } finally {
            this.isDeleting = false;
        }
    };

    handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            this.saveEdit();
        }
        if (event.key === "Escape") {
            this.cancelEdit();
        }
    };
}

export class CommentThreadState {
    collapsed: boolean = $state(false);
    showReplyForm: boolean = $state(false);

    private readonly thread!: CommentThread;
    private readonly onCommentAdded?: (comment: GithubPRComment) => void;
    private readonly onCommentUpdated?: (comment: GithubPRComment) => void;
    private readonly onCommentDeleted?: (commentId: number) => void;

    readonly hasToken = $derived(!!getGithubToken());
    readonly topLevelComments = $derived(this.thread.comments.filter((comment) => !comment.in_reply_to_id));
    readonly replies = $derived(this.thread.comments.filter((comment) => comment.in_reply_to_id));

    constructor(
        thread: CommentThread,
        onCommentAdded?: (comment: GithubPRComment) => void,
        onCommentUpdated?: (comment: GithubPRComment) => void,
        onCommentDeleted?: (commentId: number) => void,
    ) {
        this.thread = thread;
        this.collapsed = thread.collapsed;
        this.onCommentAdded = onCommentAdded;
        this.onCommentUpdated = onCommentUpdated;
        this.onCommentDeleted = onCommentDeleted;
    }

    readonly isMultilineThread = $derived.by(() => {
        const firstComment = this.topLevelComments[0];
        return firstComment && firstComment.start_line !== undefined && firstComment.start_line !== null && firstComment.start_line !== firstComment.line;
    });

    readonly lineRangeDisplay = $derived.by(() => {
        if (!this.isMultilineThread) {
            return `${this.thread.position.line}`;
        }

        const firstComment = this.topLevelComments[0];
        if (!firstComment || firstComment.start_line === undefined || firstComment.start_line === null) {
            return `${this.thread.position.line}`;
        }

        return `${firstComment.start_line}-${firstComment.line}`;
    });

    readonly sideDisplay = $derived.by(() => {
        if (!this.isMultilineThread) {
            return this.thread.position.side;
        }

        const firstComment = this.topLevelComments[0];
        if (!firstComment || firstComment.start_side === undefined || firstComment.start_side === null) {
            return this.thread.position.side;
        }

        if (firstComment.start_side === firstComment.side) {
            return firstComment.side;
        }

        return `${firstComment.start_side} to ${firstComment.side}`;
    });

    toggleCollapse = (): void => {
        this.collapsed = !this.collapsed;
    };

    handleReplyAdded = (comment: GithubPRComment): void => {
        this.showReplyForm = false;
        this.onCommentAdded?.(comment);
    };

    handleCommentUpdated = (comment: GithubPRComment): void => {
        this.onCommentUpdated?.(comment);
    };

    handleCommentDeleted = (commentId: number): void => {
        this.onCommentDeleted?.(commentId);
    };
}

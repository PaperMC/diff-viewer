import { type GithubPRComment, getGithubToken, getGithubUsername, createGithubPRComment, replyToGithubPRComment, updateGithubPRComment, deleteGithubPRComment } from "$lib/github.svelte";
import type { CommentThread } from "$lib/diff-viewer-multi-file.svelte";
import type { PatchLine } from "$lib/components/diff/concise-diff-view.svelte";

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
        !this.isReply && 
        this.props.startLine !== undefined && 
        this.props.startSide !== undefined && 
        this.props.startLine !== this.props.line
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
                endSide: this.props.side 
            };
        }

        // GitHub API requires start_line < line
        if (this.props.startLine < this.props.line) {
            return { 
                startLine: this.props.startLine, 
                startSide: this.props.startSide, 
                endLine: this.props.line, 
                endSide: this.props.side 
            };
        } else if (this.props.startLine > this.props.line) {
            return { 
                startLine: this.props.line, 
                startSide: this.props.side, 
                endLine: this.props.startLine, 
                endSide: this.props.startSide 
            };
        } else {
            // Same line number - order by side (LEFT before RIGHT)
            if (this.props.startSide === "LEFT" && this.props.side === "RIGHT") {
                return { 
                    startLine: this.props.startLine, 
                    startSide: this.props.startSide, 
                    endLine: this.props.line, 
                    endSide: this.props.side 
                };
            } else {
                return { 
                    startLine: this.props.line, 
                    startSide: this.props.side, 
                    endLine: this.props.startLine, 
                    endSide: this.props.startSide 
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
                comment = await replyToGithubPRComment(
                    token, 
                    this.props.owner, 
                    this.props.repo, 
                    this.props.prNumber, 
                    this.props.replyToId!, 
                    this.text.trim()
                );
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
        onDeleted?: (commentId: number) => void
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
            const updatedComment = await updateGithubPRComment(
                token, 
                this.owner, 
                this.repo, 
                this.comment.id, 
                this.editText.trim()
            );
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
    readonly topLevelComments = $derived(this.thread.comments.filter(comment => !comment.in_reply_to_id));
    readonly replies = $derived(this.thread.comments.filter(comment => comment.in_reply_to_id));

    constructor(
        thread: CommentThread,
        onCommentAdded?: (comment: GithubPRComment) => void,
        onCommentUpdated?: (comment: GithubPRComment) => void,
        onCommentDeleted?: (commentId: number) => void
    ) {
        this.thread = thread;
        this.collapsed = thread.collapsed;
        this.onCommentAdded = onCommentAdded;
        this.onCommentUpdated = onCommentUpdated;
        this.onCommentDeleted = onCommentDeleted;
    }

    readonly isMultilineThread = $derived.by(() => {
        const firstComment = this.topLevelComments[0];
        return firstComment && 
               firstComment.start_line !== undefined && 
               firstComment.start_line !== null && 
               firstComment.start_line !== firstComment.line;
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

export interface LineSelection {
    line: PatchLine;
    side: "LEFT" | "RIGHT";
}

export class CommentSelectionState {
    isSelecting: boolean = $state(false);
    selectionStart: LineSelection | null = $state(null);
    selectionEnd: LineSelection | null = $state(null);
    isDragging: boolean = $state(false);
    dragStartPosition: { x: number; y: number } | null = $state(null);
    showNewCommentForm: string | null = $state(null); // "line:side" format
    hoveredLineKey: string | null = $state(null);

    private readonly dragThreshold = 5; // pixels
    private readonly canAddComments: boolean;
    private readonly getLineNumber: (line: PatchLine, side: "LEFT" | "RIGHT") => number | undefined;
    private readonly getLineKey: (line: PatchLine, side: "LEFT" | "RIGHT") => string;

    constructor(
        canAddComments: boolean,
        getLineNumber: (line: PatchLine, side: "LEFT" | "RIGHT") => number | undefined,
        getLineKey: (line: PatchLine, side: "LEFT" | "RIGHT") => string
    ) {
        this.canAddComments = canAddComments;
        this.getLineNumber = getLineNumber;
        this.getLineKey = getLineKey;
    }

    handleMouseDown = (event: MouseEvent, line: PatchLine, side: "LEFT" | "RIGHT"): void => {
        if (!this.canAddComments) return;

        const lineNum = this.getLineNumber(line, side);
        if (lineNum === undefined) return;

        this.dragStartPosition = { x: event.clientX, y: event.clientY };
        this.isSelecting = true;
        this.isDragging = false;
        this.selectionStart = { line, side };
        this.selectionEnd = { line, side };
    };

    handleMouseMove = (event: MouseEvent, line: PatchLine, side: "LEFT" | "RIGHT"): void => {
        if (!this.isSelecting || !this.canAddComments) return;

        const lineNum = this.getLineNumber(line, side);
        if (lineNum === undefined) return;

        if (!this.isDragging && this.dragStartPosition) {
            const dx = event.clientX - this.dragStartPosition.x;
            const dy = event.clientY - this.dragStartPosition.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > this.dragThreshold) {
                this.isDragging = true;
                event.preventDefault();
            }
        }

        if (this.isDragging) {
            this.selectionEnd = { line, side };
        }
    };

    handleMouseUp = (): void => {
        if (!this.isSelecting) return;

        if (this.isDragging && this.selectionStart && this.selectionEnd) {
            const hasMultilineSelection = this.selectionStart.line !== this.selectionEnd.line || 
                                         this.selectionStart.side !== this.selectionEnd.side;
            
            if (hasMultilineSelection) {
                const startLineNum = this.getLineNumber(this.selectionStart.line, this.selectionStart.side);
                const endLineNum = this.getLineNumber(this.selectionEnd.line, this.selectionEnd.side);

                if (startLineNum !== undefined && endLineNum !== undefined) {
                    // Ensure proper order
                    if (startLineNum > endLineNum || 
                        (startLineNum === endLineNum && this.selectionStart.side === "RIGHT" && this.selectionEnd.side === "LEFT")) {
                        const temp = this.selectionStart;
                        this.selectionStart = this.selectionEnd;
                        this.selectionEnd = temp;
                    }

                    this.showNewCommentForm = this.getLineKey(this.selectionEnd.line, this.selectionEnd.side);
                    this.isSelecting = false;
                    this.isDragging = false;
                    this.dragStartPosition = null;
                    return;
                }
            }
        }

        this.clearSelection();
    };

    handleClick = (event: MouseEvent, line: PatchLine, side: "LEFT" | "RIGHT"): void => {
        if (this.isDragging) {
            event.preventDefault();
            return;
        }

        if (this.selectionStart && this.selectionEnd && 
            (this.selectionStart.line !== this.selectionEnd.line || this.selectionStart.side !== this.selectionEnd.side)) {
            event.preventDefault();
            return;
        }

        this.handleAddComment(line, side);
    };

    handleAddComment = (line: PatchLine, side: "LEFT" | "RIGHT"): void => {
        const lineKey = this.getLineKey(line, side);

        if (this.showNewCommentForm && this.showNewCommentForm !== lineKey) {
            this.showNewCommentForm = lineKey;
            this.clearSelection();
            return;
        }

        if (this.selectionStart && this.selectionEnd && 
            (this.selectionStart.line !== this.selectionEnd.line || this.selectionStart.side !== this.selectionEnd.side)) {
            const startLineNum = this.getLineNumber(this.selectionStart.line, this.selectionStart.side);
            const endLineNum = this.getLineNumber(this.selectionEnd.line, this.selectionEnd.side);

            if (startLineNum !== undefined && endLineNum !== undefined) {
                if (startLineNum > endLineNum || 
                    (startLineNum === endLineNum && this.selectionStart.side === "RIGHT" && this.selectionEnd.side === "LEFT")) {
                    const temp = this.selectionStart;
                    this.selectionStart = this.selectionEnd;
                    this.selectionEnd = temp;
                }

                this.showNewCommentForm = this.getLineKey(this.selectionEnd.line, this.selectionEnd.side);
                this.clearSelection();
                return;
            }
        }

        this.showNewCommentForm = lineKey;
        this.clearSelection();
    };

    isLineInSelection(line: PatchLine, side: "LEFT" | "RIGHT"): boolean {
        if (!this.selectionStart || !this.selectionEnd) return false;

        const lineNum = this.getLineNumber(line, side);
        if (lineNum === undefined) return false;

        const startLineNum = this.getLineNumber(this.selectionStart.line, this.selectionStart.side);
        const endLineNum = this.getLineNumber(this.selectionEnd.line, this.selectionEnd.side);

        if (startLineNum === undefined || endLineNum === undefined) return false;

        let actualStartLineNum = startLineNum;
        let actualEndLineNum = endLineNum;
        let actualStartSide = this.selectionStart.side;
        let actualEndSide = this.selectionEnd.side;

        if (startLineNum > endLineNum || 
            (startLineNum === endLineNum && this.selectionStart.side === "RIGHT" && this.selectionEnd.side === "LEFT")) {
            actualStartLineNum = endLineNum;
            actualEndLineNum = startLineNum;
            actualStartSide = this.selectionEnd.side;
            actualEndSide = this.selectionStart.side;
        }

        if (actualStartSide === actualEndSide && side === actualStartSide) {
            return lineNum >= actualStartLineNum && lineNum <= actualEndLineNum;
        }

        if (actualStartSide !== actualEndSide) {
            if (side === actualStartSide) {
                return lineNum >= actualStartLineNum;
            } else if (side === actualEndSide) {
                return lineNum <= actualEndLineNum;
            }
        }

        return false;
    }

    clearSelection = (): void => {
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.isDragging = false;
        this.dragStartPosition = null;
    };

    cancelCommentForm = (): void => {
        this.showNewCommentForm = null;
        this.clearSelection();
    };
} 
import { diffArrays, type StructuredPatchHunk, type StructuredPatch, parsePatch } from "diff";
import {
    codeToTokens,
    type BundledLanguage,
    type BundledTheme,
    type CodeToTokensOptions,
    type GrammarState,
    type TokensResult,
    type ThemedToken,
    type ThemeRegistration,
    bundledThemes,
} from "shiki";
import { guessLanguageFromExtension, type MutableValue, type ReadableBoxedValues } from "$lib/util";
import type { IRawThemeSetting } from "shiki/textmate";
import chroma from "chroma-js";
import { onDestroy } from "svelte";
import { getEffectiveGlobalTheme } from "$lib/theme.svelte";

export const DEFAULT_THEME_LIGHT: BundledTheme = "github-light-default";
export const DEFAULT_THEME_DARK: BundledTheme = "github-dark-default";

export type DiffViewerPatch = {
    hunks: DiffViewerPatchHunk[];
};

export type DiffViewerPatchHunk = {
    lines: PatchLine[];
    innerPatchHeaderChangesOnly?: boolean;
};

export type PatchLine = {
    type: PatchLineType;
    content: LineSegment[];
    lineBreak?: boolean;
    innerPatchLineType: InnerPatchLineType;
    oldLineNo?: number;
    newLineNo?: number;
};

export type LineSegment = {
    text?: string | null;
    iconClass?: string | null;
    caption?: string | null;
    classes?: string;
    style?: string;
};

export enum PatchLineType {
    HEADER,
    CONTEXT,
    ADD,
    REMOVE,
    SPACER,
}

export enum InnerPatchLineType {
    ADD,
    REMOVE,
    NONE,
}

export type PatchLineTypeProps = {
    classes: string;
    lineNoClasses: string;
    prefix: string;
};

export const patchLineTypeProps: Record<PatchLineType, PatchLineTypeProps> = {
    [PatchLineType.HEADER]: {
        classes: "bg-[var(--hunk-header-bg)] text-[var(--hunk-header-fg)]",
        lineNoClasses: "bg-[var(--hunk-header-bg)] text-[var(--hunk-header-fg)]",
        prefix: "",
    },
    [PatchLineType.ADD]: {
        classes: "bg-[var(--inserted-line-bg)]",
        lineNoClasses: "bg-[var(--inserted-line-bg)]",
        prefix: "+",
    },
    [PatchLineType.REMOVE]: {
        classes: "bg-[var(--removed-line-bg)]",
        lineNoClasses: "bg-[var(--removed-line-bg)]",
        prefix: "-",
    },
    [PatchLineType.CONTEXT]: {
        classes: "",
        lineNoClasses: "text-em-med",
        prefix: "",
    },
    [PatchLineType.SPACER]: {
        classes: "h-2",
        lineNoClasses: "",
        prefix: "",
    },
};

export type InnerPatchLineTypeProps = {
    style: string;
};

export const innerPatchLineTypeProps: Record<InnerPatchLineType, InnerPatchLineTypeProps> = {
    [InnerPatchLineType.ADD]: {
        // Make sure tailwind emits these props
        // "bg-green-100 bg-green-300 bg-green-400 bg-green-800"
        style: `
          --fg-override: var(--inner-inserted-line-fg);
          background-color: var(--inner-inserted-line-bg);`,
    },
    [InnerPatchLineType.REMOVE]: {
        // Make sure tailwind emits these props
        // "bg-red-100 bg-red-300 bg-red-400 bg-red-800"
        style: `
          --fg-override: var(--inner-removed-line-fg);
          background-color: var(--inner-removed-line-bg);`,
    },
    [InnerPatchLineType.NONE]: {
        style: "",
    },
};

const joiner = "\uE000";
const noTrailingNewlineMarker: string = joiner + joiner + ["PATCH", "ROULETTE", "NO", "TRAILING", "NEWLINE", "MARKER"].join(joiner) + joiner + joiner;

enum LineProcessorState {
    CONTEXT,
    ADD,
    REMOVE,
}

class LineProcessor {
    private contentLines: string[] = [];
    private output: PatchLine[] = [];
    private state: LineProcessorState = LineProcessorState.CONTEXT;
    private addLinesText: string[] = [];
    private removeLinesText: string[] = [];
    private contextLinesText: string[] = [];
    private fromFile: string | undefined;
    private toFile: string | undefined;
    private patchFile: boolean = false;
    private lastShikiStateAdd: GrammarState | null = null;
    private lastShikiStateRemove: GrammarState | null = null;
    private lastShikiStateContext: GrammarState | null = null;
    private syntaxHighlighting: boolean = true;
    private syntaxHighlightingTheme: BundledTheme = DEFAULT_THEME_LIGHT;
    private wordDiffs: boolean = true;
    private oldLineNo: number = 0;
    private newLineNo: number = 0;

    async process(
        fromFile: string | undefined,
        toFile: string | undefined,
        hunk: StructuredPatchHunk,
        syntaxHighlighting: boolean,
        syntaxHighlightingTheme: BundledTheme | undefined,
        wordDiffs: boolean,
    ): Promise<PatchLine[]> {
        this.initialize(fromFile, toFile, hunk, syntaxHighlighting, syntaxHighlightingTheme, wordDiffs);
        await this.processInternal();
        return this.output;
    }

    private initialize(
        fromFile: string | undefined,
        toFile: string | undefined,
        hunk: StructuredPatchHunk,
        syntaxHighlighting: boolean,
        syntaxHighlightingTheme: BundledTheme | undefined,
        wordDiffs: boolean,
    ) {
        this.contentLines = hunk.lines;
        this.output = [];
        this.oldLineNo = hunk.oldStart;
        this.newLineNo = hunk.newStart;
        this.state = LineProcessorState.CONTEXT;
        this.addLinesText = [];
        this.removeLinesText = [];
        this.contextLinesText = [];
        this.fromFile = fromFile;
        this.toFile = toFile;
        this.patchFile = this.isPatchFile(fromFile) || this.isPatchFile(toFile);
        this.lastShikiStateAdd = null;
        this.lastShikiStateRemove = null;
        this.lastShikiStateContext = null;
        this.syntaxHighlighting = syntaxHighlighting;
        this.syntaxHighlightingTheme = syntaxHighlightingTheme || this.syntaxHighlightingTheme;
        this.wordDiffs = wordDiffs;
    }

    private eitherFileName(): string | undefined {
        return this.fromFile || this.toFile;
    }

    private isPatchFile(path: string | undefined): boolean {
        if (path === undefined) {
            return false;
        }
        return path.endsWith(".patch") || path.endsWith(".diff");
    }

    private async processInternal() {
        for (let i = 0; i < this.contentLines.length; i++) {
            // Yield to the event loop every couple hundred lines so large diffs don't freeze the UI
            if (i % 200 === 0) {
                // Using a micro-task is enough to let rendering catch up without noticeable slowdown
                await Promise.resolve();
            }
            const lineText = this.contentLines[i];

            const oldState = this.state;
            if (lineText.startsWith("+")) {
                this.state = LineProcessorState.ADD;
            } else if (lineText.startsWith("-")) {
                this.state = LineProcessorState.REMOVE;
            } else {
                if (isNoNewlineAtEofLine(lineText)) {
                    // This is metadata for the previous line
                    switch (this.state) {
                        case LineProcessorState.ADD:
                            this.addLinesText[this.addLinesText.length - 1] += noTrailingNewlineMarker;
                            break;
                        case LineProcessorState.REMOVE:
                            this.removeLinesText[this.removeLinesText.length - 1] += noTrailingNewlineMarker;
                            break;
                        case LineProcessorState.CONTEXT:
                            this.contextLinesText[this.contextLinesText.length - 1] += noTrailingNewlineMarker;
                            break;
                    }
                    continue;
                } else {
                    this.state = LineProcessorState.CONTEXT;
                }
            }

            const stateChanged = oldState !== this.state;

            if (stateChanged && this.state === LineProcessorState.CONTEXT) {
                /*
                 * Transition to CONTEXT
                 */
                if (this.wordDiffs && this.addLinesText.length == this.removeLinesText.length) {
                    await this.processLineDiff();
                } else {
                    // The added and removed lines are not adjacent or are not symmetric
                    await this.appendRemainingPlain();
                }
            } else if (stateChanged && oldState === LineProcessorState.CONTEXT) {
                /*
                 * Transition from CONTEXT
                 */
                await this.appendRemainingPlain();
            }

            if (this.state === LineProcessorState.ADD) {
                this.addLinesText.push(lineText.substring(1));
            } else if (this.state === LineProcessorState.REMOVE) {
                this.removeLinesText.push(lineText.substring(1));
            } else {
                this.contextLinesText.push(lineText.substring(1));
            }
        }

        if (this.state === LineProcessorState.CONTEXT) {
            await this.appendRemainingPlain();
        } else if (this.wordDiffs && this.addLinesText.length == this.removeLinesText.length) {
            await this.processLineDiff();
        } else {
            // The added and removed lines are not adjacent or are not symmetric
            await this.appendRemainingPlain();
        }

        this.postprocess();
    }

    private async codeToSegmentsPlain(text: string, state: LineProcessorState): Promise<LineSegment[]> {
        const tokensResult = await this.codeToTokensResult(text, state);
        if (tokensResult) {
            return tokensResult.tokens[0].map((token) => {
                return { text: token.content, style: this.getSegmentStyle(state, token.color) };
            });
        } else {
            return [{ text, style: this.getSegmentStyle(state) }];
        }
    }

    private getSegmentStyle(state: LineProcessorState, color?: string | undefined): string {
        const segmentFg = color ? `--segment-fg: ${color};` : "";
        switch (state) {
            case LineProcessorState.ADD:
                return `color: var(--fg-override, var(--inserted-line-fg-themed, var(--segment-fg, var(--editor-fg)))); ${segmentFg}`;
            case LineProcessorState.REMOVE:
                return `color: var(--fg-override, var(--removed-line-fg-themed, var(--segment-fg, var(--editor-fg)))); ${segmentFg}`;
            case LineProcessorState.CONTEXT:
                return `color: var(--fg-override, var(--segment-fg, var(--editor-fg)));${segmentFg};`;
        }
    }

    private async codeToTokensResult(text: string, state: LineProcessorState): Promise<TokensResult | null> {
        if (!this.syntaxHighlighting) {
            return null;
        }

        const opts: CodeToTokensOptions<BundledLanguage, BundledTheme> = {
            lang: guessLanguageFromExtension(this.eitherFileName()!),
            theme: this.syntaxHighlightingTheme,
        };

        // Use state from the previous line, using context to fill the gaps
        // for adds/removes and adds to fill the gaps for context
        switch (state) {
            case LineProcessorState.ADD:
                opts.grammarState = this.lastShikiStateAdd || this.lastShikiStateContext || undefined;
                break;
            case LineProcessorState.REMOVE:
                opts.grammarState = this.lastShikiStateRemove || this.lastShikiStateContext || undefined;
                break;
            case LineProcessorState.CONTEXT:
                opts.grammarState = this.lastShikiStateContext || this.lastShikiStateAdd || undefined;
                break;
        }

        let result;
        try {
            result = await codeToTokens(text, opts);
        } catch (err) {
            this.lastShikiStateContext = null;
            this.lastShikiStateAdd = null;
            this.lastShikiStateRemove = null;
            console.error(`Error tokenizing line '${text}' of file '${this.fromFile}' -> '${this.toFile}'`, err);
            return null;
        }
        result.tokens = result.tokens.map(mergeTokens);

        switch (state) {
            case LineProcessorState.ADD:
                this.lastShikiStateAdd = result.grammarState || null;
                break;
            case LineProcessorState.REMOVE:
                this.lastShikiStateRemove = result.grammarState || null;
                break;
            case LineProcessorState.CONTEXT:
                this.lastShikiStateContext = result.grammarState || null;
                this.lastShikiStateAdd = null;
                this.lastShikiStateRemove = null;
                break;
        }

        return result;
    }

    private async appendRemainingPlain() {
        for (let i = 0; i < this.removeLinesText.length; i++) {
            const text = this.removeLinesText[i];
            const content = await this.codeToSegmentsPlain(text, LineProcessorState.REMOVE);
            this.output.push({
                content,
                type: PatchLineType.REMOVE,
                innerPatchLineType: this.getInnerType(text),
                oldLineNo: this.oldLineNo++,
                newLineNo: undefined,
            });
        }
        for (let i = 0; i < this.addLinesText.length; i++) {
            const text = this.addLinesText[i];
            const content = await this.codeToSegmentsPlain(text, LineProcessorState.ADD);
            this.output.push({
                content,
                type: PatchLineType.ADD,
                innerPatchLineType: this.getInnerType(text),
                oldLineNo: undefined,
                newLineNo: this.newLineNo++,
            });
        }
        for (let i = 0; i < this.contextLinesText.length; i++) {
            const text = this.contextLinesText[i];
            const content = await this.codeToSegmentsPlain(text, LineProcessorState.CONTEXT);
            this.output.push({
                content,
                type: PatchLineType.CONTEXT,
                innerPatchLineType: this.getInnerType(text),
                oldLineNo: this.oldLineNo++,
                newLineNo: this.newLineNo++,
            });
        }
        this.removeLinesText = [];
        this.addLinesText = [];
        this.contextLinesText = [];
    }

    private async processLineDiff() {
        const addLines: LineSegment[][] = [];
        const removeLines: LineSegment[][] = [];

        for (let j = 0; j < this.addLinesText.length; j++) {
            // Get syntax highlighting from Shiki for both lines
            const removeShikiResult = await this.codeToTokensResult(this.removeLinesText[j], LineProcessorState.REMOVE);
            const addShikiResult = await this.codeToTokensResult(this.addLinesText[j], LineProcessorState.ADD);

            // Tokenize for diff
            const removeStringTokens = genericTokenize(this.removeLinesText[j]);
            const addStringTokens = genericTokenize(this.addLinesText[j]);

            const diffResult = diffArrays(removeStringTokens, addStringTokens, {
                oneChangePerToken: false,
            });

            // Map colors from Shiki to our tokens
            const addLine: LineSegment[] = [];
            const removeLine: LineSegment[] = [];
            let removePos = 0;
            let addPos = 0;

            for (const change of diffResult) {
                const text = change.value.join("");
                if (change.added) {
                    const segments = this.makeSegments(addShikiResult, addPos, text, `bg-[var(--inserted-text-bg)]`, LineProcessorState.ADD);

                    segments[0].classes = segments[0].classes + " rounded-l-sm";
                    segments[segments.length - 1].classes = segments[segments.length - 1].classes + " rounded-r-sm";

                    addLine.push(...segments);
                    addPos += text.length;
                } else if (change.removed) {
                    const segments = this.makeSegments(removeShikiResult, removePos, text, `bg-[var(--removed-text-bg)]`, LineProcessorState.REMOVE);

                    segments[0].classes = segments[0].classes + " rounded-l-sm";
                    segments[segments.length - 1].classes = segments[segments.length - 1].classes + " rounded-r-sm";

                    removeLine.push(...segments);
                    removePos += text.length;
                } else {
                    addLine.push(...this.makeSegments(addShikiResult, addPos, text, "", LineProcessorState.ADD));
                    addPos += text.length;

                    removeLine.push(...this.makeSegments(removeShikiResult, removePos, text, "", LineProcessorState.REMOVE));
                    removePos += text.length;
                }
            }

            if (addLine.length !== 0) {
                addLines.push(addLine);
            }
            if (removeLine.length !== 0) {
                removeLines.push(removeLine);
            }
        }

        removeLines.forEach((line) => {
            this.output.push({
                content: line,
                type: PatchLineType.REMOVE,
                innerPatchLineType: this.getInnerType(line[0].text!),
                oldLineNo: this.oldLineNo++,
                newLineNo: undefined,
            });
        });
        addLines.forEach((line) => {
            this.output.push({
                content: line,
                type: PatchLineType.ADD,
                innerPatchLineType: this.getInnerType(line[0].text!),
                oldLineNo: undefined,
                newLineNo: this.newLineNo++,
            });
        });

        this.addLinesText = [];
        this.removeLinesText = [];
    }

    private makeSegments(
        shikiResult: TokensResult | null,
        startPosition: number,
        text: string,
        baseClasses: string,
        lineState: LineProcessorState,
    ): LineSegment[] {
        if (shikiResult) {
            return this.makeSegmentsShiki(shikiResult, startPosition, text, baseClasses, lineState);
        }

        return [{ text, classes: baseClasses, style: this.getSegmentStyle(lineState) }];
    }

    // Use the Shiki color data to split the text into colored segments
    private makeSegmentsShiki(
        shikiResult: TokensResult,
        startPosition: number,
        text: string,
        baseClasses: string,
        lineState: LineProcessorState,
    ): LineSegment[] {
        const segments: LineSegment[] = [];
        let remainingText = text;
        let position = startPosition;
        const tokens = [...shikiResult.tokens[0]];

        let token: ThemedToken;
        while (tokens.length > 0) {
            token = tokens.shift()!;

            const tokenStart = token.offset;
            const tokenEnd = tokenStart + token.content.length;

            // Skip tokens that end before the current position
            if (position >= tokenEnd) {
                continue;
            }

            if (tokenStart >= position + remainingText.length) {
                throw Error("Encountered token that starts after the end of the text");
            }

            // Split the text into parts that are in the Shiki token and the trailing text
            const overlapLength = Math.min(tokenEnd - position, remainingText.length);
            const consumedToken = overlapLength === remainingText.length;
            const overlapText = remainingText.substring(0, overlapLength);
            const trailingText = remainingText.substring(overlapLength);

            segments.push({
                text: overlapText,
                classes: baseClasses,
                style: this.getSegmentStyle(lineState, token.color),
            });

            remainingText = trailingText;
            position = position + overlapLength;
            if (!consumedToken) {
                tokens.unshift(token);
            }

            if (remainingText.length === 0) {
                // We reached the end of the text
                break;
            }
        }

        if (remainingText.length > 0) {
            throw Error("Remaining text after processing all tokens");
        }

        return segments;
    }

    private postprocess() {
        for (const line of this.output) {
            if (line.content.length === 0 || (line.content.length === 1 && line.content[0].text === "")) {
                line.lineBreak = true;
                line.content = [];
                continue;
            }
            const lastSegment = line.content[line.content.length - 1];
            if (!lastSegment.text) {
                continue;
            }
            if (lastSegment.text.endsWith(noTrailingNewlineMarker)) {
                lastSegment.text = lastSegment.text.substring(0, lastSegment.text.length - noTrailingNewlineMarker.length);
                if (lastSegment.text === "") {
                    line.content.pop();
                }
                line.content.push({
                    iconClass: "octicon--no-entry-16",
                    caption: "No trailing newline",
                    classes: lastSegment.classes + " text-red-600",
                });
            }
        }
    }

    private getInnerType(text: string) {
        if (this.patchFile) {
            if (text.startsWith("+")) {
                return InnerPatchLineType.ADD;
            } else if (text.startsWith("-")) {
                return InnerPatchLineType.REMOVE;
            }
        }

        return InnerPatchLineType.NONE;
    }
}

export function isNoNewlineAtEofLine(text: string) {
    return text === "\\ No newline at end of file";
}

// Our tokens will be split when they intersect two shiki tokens, so we preprocess to merge tokens with same style,
// accounting for style of whitespace being irrelevant
function mergeTokens(tokens: ThemedToken[]): ThemedToken[] {
    function isWhitespace(token: ThemedToken) {
        return token.content.trim() === "";
    }

    const mergedTokens: ThemedToken[] = [];
    let lastToken: ThemedToken | null = null;

    for (const token of tokens) {
        if (lastToken === null) {
            lastToken = { ...token };
        } else if (lastToken.color === token.color) {
            lastToken.content += token.content;
        } else if (isWhitespace(lastToken)) {
            token.content = lastToken.content + token.content;
            token.offset = lastToken.offset;
            lastToken = token;
        } else if (isWhitespace(token)) {
            lastToken.content += token.content;
        } else {
            mergedTokens.push(lastToken);
            lastToken = { ...token };
        }
    }

    if (lastToken !== null) {
        mergedTokens.push(lastToken);
    }

    return mergedTokens;
}

const lineProcessors: LineProcessor[] = [];

async function withLineProcessor<R>(fn: (proc: LineProcessor) => Promise<R>): Promise<R> {
    const lineProcessor = lineProcessors.pop() ?? new LineProcessor();
    try {
        return await fn(lineProcessor);
    } finally {
        lineProcessors.push(lineProcessor);
    }
}

export async function parseDiffViewerPatch(
    patchPromise: StructuredPatch | Promise<StructuredPatch>,
    syntaxHighlighting: boolean,
    syntaxHighlightingTheme: BundledTheme | undefined,
    omitPatchHeaderOnlyHunks: boolean,
    wordDiffs: boolean,
): Promise<DiffViewerPatch> {
    const patch = await patchPromise;
    const hunks: DiffViewerPatchHunk[] = [];

    for (let i = 0; i < patch.hunks.length; i++) {
        const hunk = patch.hunks[i];
        hunks.push(await makeHunk(patch, hunk, syntaxHighlighting, syntaxHighlightingTheme, omitPatchHeaderOnlyHunks, wordDiffs));
    }

    return { hunks };
}

async function makeHunk(
    patch: StructuredPatch,
    hunk: StructuredPatchHunk,
    syntaxHighlighting: boolean,
    syntaxHighlightingTheme: BundledTheme | undefined,
    omitPatchHeaderOnlyHunks: boolean,
    wordDiffs: boolean,
): Promise<DiffViewerPatchHunk> {
    // Skip this hunk if it only contains header changes
    if (omitPatchHeaderOnlyHunks && !hasNonHeaderChanges(hunk.lines)) {
        return { innerPatchHeaderChangesOnly: true, lines: [] };
    }

    const lines: PatchLine[] = [];

    // Add the hunk header
    const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
    lines.push({
        type: PatchLineType.HEADER,
        content: [{ text: header }],
        innerPatchLineType: InnerPatchLineType.NONE,
    });

    const oldFileName = patch.oldFileName === "/dev/null" ? undefined : patch.oldFileName;
    const newFileName = patch.newFileName === "/dev/null" ? undefined : patch.newFileName;
    const hunkLines = await withLineProcessor((proc) => {
        return proc.process(oldFileName, newFileName, hunk, syntaxHighlighting, syntaxHighlightingTheme, wordDiffs);
    });
    lines.push(...hunkLines);

    // Add a separator between hunks
    lines.push({ content: [{ text: "" }], type: PatchLineType.SPACER, innerPatchLineType: InnerPatchLineType.NONE });

    return { lines };
}

export function patchHeaderDiffOnly(patch: StructuredPatch): boolean {
    if (patch.hunks.length === 0) {
        return false;
    }
    let onlyHeaderChanges = true;
    for (let j = 0; j < patch.hunks.length; j++) {
        if (hasNonHeaderChanges(patch.hunks[j].lines)) {
            onlyHeaderChanges = false;
        }
    }
    return onlyHeaderChanges;
}

export function hasNonHeaderChanges(contentLines: string[]) {
    for (const line of contentLines) {
        if (lineHasNonHeaderChange(line)) {
            return true;
        }
    }
    return false;
}

const indexHeaderRegex = /^index [0-9a-f]+\.\.[0-9a-f]+ \d+$/;

function lineHasNonHeaderChange(line: string) {
    if (!(line.startsWith("+") || line.startsWith("-"))) {
        // context line
        return false;
    }

    // Added or removed content
    const content = line.substring(1);
    // Skip header lines and hunk headers in nested patches
    return !(
        content.startsWith("+++") ||
        content.startsWith("---") ||
        content.startsWith("@@ -") ||
        content.startsWith("@@ +") ||
        content.match(indexHeaderRegex)
    );
}

const delimiters = [
    " ",
    "\t",
    "\n",
    ".",
    ",",
    ":",
    ";",
    "(",
    ")",
    "[",
    "]",
    "{",
    "}",
    "'",
    '"',
    "`",
    "|",
    "&",
    "<",
    ">",
    "=",
    "+",
    "-",
    "*",
    "/",
    "%",
    "!",
    "?",
    "#",
    "@",
    "^",
    "~",
    "\\",
    "$",
];

function genericTokenize(content: string): string[] {
    const tokens: string[] = [];
    let currentToken = "";

    for (let i = 0; i < content.length; i++) {
        const char = content[i];

        if (delimiters.includes(char)) {
            if (currentToken) {
                tokens.push(currentToken);
                currentToken = "";
            }
            tokens.push(char);
        } else {
            currentToken += char;
        }
    }

    if (currentToken) {
        tokens.push(currentToken);
    }

    return tokens;
}

function hasScope(token: IRawThemeSetting, scope: string) {
    return token.scope && (token.scope === scope || token.scope.includes(scope));
}

type ThemeColorQuery = {
    // color name in theme.colors
    color?: string;
    // scope of token to use background color from
    bgTokenScope?: string;
    // scope of token to use foreground color from
    fgTokenScope?: string;
    // optional modifier for the color value
    modifier?: (value: string | undefined) => string | undefined;
};

function extractColor(theme: ThemeRegistration, opts: ThemeColorQuery): string | undefined {
    const colors = theme.colors || {};
    const tokenColors = theme.tokenColors || [];
    const modifier = opts.modifier || ((v) => v);
    const value = opts.color ? colors[opts.color] : null;
    if (value) {
        return modifier(value);
    }
    if (opts.bgTokenScope) {
        const token = tokenColors.find((t) => hasScope(t, opts.bgTokenScope!) && t.settings.background);
        if (token) {
            return modifier(token.settings.background);
        }
    }
    if (opts.fgTokenScope) {
        const token = tokenColors.find((t) => hasScope(t, opts.fgTokenScope!) && t.settings.foreground);
        if (token) {
            return modifier(token.settings.foreground);
        }
    }
    return undefined;
}

function makeLCHVars(prefix: string, color: string | undefined, into: Map<string, string | undefined>) {
    if (!color) {
        return;
    }
    const oklch = chroma(color).oklch();
    into.set(`${prefix}-l`, `${oklch[0]}`);
    into.set(`${prefix}-c`, `${oklch[1]}`);
    if (isNaN(oklch[2])) {
        into.set(`${prefix}-h`, "0");
    } else {
        into.set(`${prefix}-h`, `${oklch[2]}`);
    }
}

function moreChroma(color: string | undefined, value: number = 1) {
    if (!color) return undefined;
    return chroma(color).saturate(value).css("oklch");
}

function darken(color: string | undefined, value: number = 1) {
    if (!color) return undefined;
    return chroma(color).darken(value).css("oklch");
}

function makeTransparent(hex: string | undefined) {
    if (!hex) return undefined;
    const rgb = chroma(hex).rgb();
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.5)`;
}

// Memoization cache to avoid recomputing base colors for every diff view
const baseColorCache: Map<string, Promise<string>> = new Map();

export async function getBaseColors(themeKey: BundledTheme | undefined, syntaxHighlighting: boolean, isDark: boolean): Promise<string> {
    const cacheKey = `${String(themeKey)}|${syntaxHighlighting}|${isDark}`;
    if (baseColorCache.has(cacheKey)) {
        return baseColorCache.get(cacheKey)!;
    }

    const compute = (async () => {
        const theme = await getTheme(themeKey);
        if (!syntaxHighlighting || !theme) {
            let styles = "";
            if (isDark) {
                // Make sure tailwind emits these props
                // "text-green-600 text-red-600 text-green-700 text-red-700 text-green-800 text-red-800 text-blue-800"
                styles += `
                  --hunk-header-bg-themed: var(--color-gray-800);
                  --select-bg-themed: var(--color-blue-800);

                  --inserted-text-bg-themed: var(--color-green-700);
                  --removed-text-bg-themed: var(--color-red-700);
                  --inserted-line-bg-themed: var(--color-green-800);
                  --removed-line-bg-themed: var(--color-red-800);
                  --inner-inserted-line-bg-themed: var(--color-green-600);
                  --inner-removed-line-bg-themed: var(--color-red-600);
                  --inner-inserted-line-fg-themed: var(--color-green-300);
                  --inner-removed-line-fg-themed: var(--color-red-300);
                  `;
            } else {
                styles += `
                  --inserted-text-bg-themed: var(--color-green-400);
                  --removed-text-bg-themed: var(--color-red-400);
                  --inserted-line-bg-themed: var(--color-green-100);
                  --removed-line-bg-themed: var(--color-red-100);
                  --inner-inserted-line-bg-themed: var(--color-green-300);
                  --inner-removed-line-bg-themed: var(--color-red-300);
                  --inner-inserted-line-fg-themed: var(--color-green-800);
                  --inner-removed-line-fg-themed: var(--color-red-800);
                  `;
            }
            return styles;
        }
        const tokenColors = theme.default.tokenColors || [];

        const style: Map<string, string | undefined> = new Map();

        // Find the foreground/default text color for the theme
        const foundFg = extractColor(theme.default, { color: "editor.foreground" });
        if (foundFg) {
            style.set("--editor-fg-themed", foundFg);
            makeLCHVars("--editor-foreground", foundFg, style);
        } else {
            let globalScope = tokenColors.find((t) => t.scope === undefined);
            if (!globalScope) {
                // Tokenize something to force Shiki to run it's fix for 'broken' themes
                await codeToTokens("hi", { theme: theme.default, lang: "text" });
                globalScope = tokenColors.find((t) => t.scope === undefined);
            }
            const globalFg = globalScope?.settings.foreground;
            if (globalFg) {
                style.set("--editor-fg-themed", globalFg);
                makeLCHVars("--editor-foreground", globalFg, style);
            } else {
                console.error("No foreground color found in theme");
            }
        }

        // These colors are mostly universal
        style.set("--editor-bg-themed", extractColor(theme.default, { color: "editor.background" }));
        makeLCHVars("--editor-background", style.get("--editor-bg-themed"), style);
        style.set("--select-bg-themed", extractColor(theme.default, { color: "editor.selectionBackground" }));

        // Don't use these - just add chroma to the inner diff highlight below for consistency
        // These are also applied to the line by VSCode...?
        // style.set("--inserted-text-bg-themed", extractColor(theme.default, { color: "diffEditor.insertedTextBackground" }));
        // style.set("--removed-text-bg-themed", extractColor(theme.default, { color: "diffEditor.removedTextBackground" }));

        // 1) Try diffEditor.insertedLineBackground for inserted line highlight color
        // 2) Try editorGutter.addedBackground for inserted line highlight color
        // 3) Try markup.inserted scope bg for inserted line highlight color
        // 4) Try markup.inserted scope fg for inserted line text color
        let insertLineBg = extractColor(theme.default, { color: "diffEditor.insertedLineBackground" });
        if (!insertLineBg) {
            insertLineBg = extractColor(theme.default, { color: "editorGutter.addedBackground", modifier: makeTransparent });
        }
        if (!insertLineBg) {
            insertLineBg = extractColor(theme.default, { bgTokenScope: "markup.inserted", modifier: makeTransparent });
        }
        if (insertLineBg) {
            style.set("--inserted-line-bg-themed", insertLineBg);
            style.set("--inner-inserted-line-bg-themed", moreChroma(insertLineBg, 0.5));
            style.set("--inserted-text-bg-themed", darken(moreChroma(insertLineBg, 1.25), 0.25));

            // Only use the fg color if we have a bg color -- otherwise it will conflict with the top level diff add/remove lines
            // Increase chroma to match our adjustments to bg color above
            style.set("--inner-inserted-line-fg-themed", moreChroma(extractColor(theme.default, { fgTokenScope: "markup.inserted" })));
        } else {
            style.set("--inserted-line-fg-themed", extractColor(theme.default, { fgTokenScope: "markup.inserted" }));
        }

        // 1) Try diffEditor.removedLineBackground for removed line highlight color
        // 2) Try editorGutter.deletedBackground for removed line highlight color
        // 3) Try markup.deleted scope bg for removed line highlight color
        // 4) Try markup.deleted scope fg for removed line text color
        let removeLineBg = extractColor(theme.default, { color: "diffEditor.removedLineBackground" });
        if (!removeLineBg) {
            removeLineBg = extractColor(theme.default, { color: "editorGutter.deletedBackground", modifier: makeTransparent });
        }
        if (!removeLineBg) {
            removeLineBg = extractColor(theme.default, { bgTokenScope: "markup.deleted", modifier: makeTransparent });
        }
        if (removeLineBg) {
            style.set("--removed-line-bg-themed", removeLineBg);
            style.set("--inner-removed-line-bg-themed", moreChroma(removeLineBg, 0.5));
            style.set("--removed-text-bg-themed", darken(moreChroma(removeLineBg, 1.25), 0.25));

            // Only use the fg color if we have a bg color -- otherwise it will conflict with the top level diff add/remove lines
            // Increase chroma to match our adjustments to bg color above
            style.set("--inner-removed-line-fg-themed", moreChroma(extractColor(theme.default, { fgTokenScope: "markup.deleted" })));
        } else {
            style.set("--removed-line-fg-themed", extractColor(theme.default, { fgTokenScope: "markup.deleted" }));
        }

        // One or both of these is often missing, see ConciseDiffView.svelte <style> for fallback behavior
        style.set("--hunk-header-bg-themed", extractColor(theme.default, { color: "sideBarSectionHeader.background" }));
        style.set("--hunk-header-fg-themed", extractColor(theme.default, { fgTokenScope: "meta.diff.header" }));

        let styleString = "";
        style.forEach((value, key) => {
            if (value) {
                styleString += `${key}: ${value};`;
            }
        });
        return styleString;
    })();

    baseColorCache.set(cacheKey, compute);
    return compute;
}

let cachedThemeKey: BundledTheme | undefined = $state(undefined);
let cachedTheme: Promise<null | { default: ThemeRegistration }> | undefined = $state(undefined);

async function getTheme(theme: BundledTheme | undefined): Promise<null | { default: ThemeRegistration }> {
    if (!theme) {
        return null;
    }
    if (cachedThemeKey === theme && cachedTheme) {
        return cachedTheme;
    }
    cachedTheme = bundledThemes[theme]();
    cachedThemeKey = theme;
    return cachedTheme;
}

export class ConciseDiffViewCachedState {
    diffViewerPatch: Promise<DiffViewerPatch>;
    syntaxHighlighting: boolean;
    syntaxHighlightingTheme: BundledTheme | undefined;
    omitPatchHeaderOnlyHunks: boolean;
    wordDiffs: boolean;

    constructor(diffViewerPatch: Promise<DiffViewerPatch>, props: ConciseDiffViewStateProps<unknown>) {
        this.diffViewerPatch = diffViewerPatch;
        this.syntaxHighlighting = props.syntaxHighlighting.current;
        this.syntaxHighlightingTheme = props.syntaxHighlightingTheme.current;
        this.omitPatchHeaderOnlyHunks = props.omitPatchHeaderOnlyHunks.current;
        this.wordDiffs = props.wordDiffs.current;
    }

    compatible(props: ConciseDiffViewStateProps<unknown>): boolean {
        return (
            this.syntaxHighlighting === props.syntaxHighlighting.current &&
            this.syntaxHighlightingTheme === props.syntaxHighlightingTheme.current &&
            this.omitPatchHeaderOnlyHunks === props.omitPatchHeaderOnlyHunks.current &&
            this.wordDiffs === props.wordDiffs.current
        );
    }
}

export function parseSinglePatch(rawPatchContent: string): StructuredPatch {
    const parsedPatches = parsePatch(rawPatchContent);
    if (parsedPatches.length !== 1) {
        throw Error("Only single-file patches are supported here");
    }
    return parsedPatches[0];
}

export interface ConciseDiffViewProps<K> {
    rawPatchContent?: string;
    patch?: StructuredPatch;

    syntaxHighlighting?: boolean;
    syntaxHighlightingTheme?: BundledTheme;
    omitPatchHeaderOnlyHunks?: boolean;
    wordDiffs?: boolean;
    lineWrap?: boolean;

    searchQuery?: string;
    searchMatchingLines?: () => Promise<number[][] | undefined>;
    activeSearchResult?: number;

    cache?: Map<K, ConciseDiffViewCachedState>;
    cacheKey?: K;
}

export type ConciseDiffViewStateProps<K> = ReadableBoxedValues<{
    patch: StructuredPatch;

    syntaxHighlighting: boolean;
    syntaxHighlightingTheme: BundledTheme | undefined;
    omitPatchHeaderOnlyHunks: boolean;
    wordDiffs: boolean;

    cache: Map<K, ConciseDiffViewCachedState> | undefined;
    cacheKey: K | undefined;
}>;

export class ConciseDiffViewState<K> {
    diffViewerPatch: Promise<DiffViewerPatch> = $state(new Promise<DiffViewerPatch>(() => []));
    cachedState: ConciseDiffViewCachedState | undefined = undefined;
    rootStyle: Promise<string> = $state(new Promise<string>(() => []));

    private readonly props: ConciseDiffViewStateProps<K>;

    constructor(props: ConciseDiffViewStateProps<K>) {
        this.props = props;

        $effect(() => {
            this.update();
        });

        $effect(() => {
            const isDark = getEffectiveGlobalTheme() === "dark";
            const promise = getBaseColors(this.props.syntaxHighlightingTheme.current, this.props.syntaxHighlighting.current, isDark);
            promise.then(
                () => {
                    this.rootStyle = promise;
                },
                () => {
                    this.rootStyle = promise;
                },
            );
        });

        onDestroy(() => {
            if (this.props.cache.current !== undefined && this.props.cacheKey.current !== undefined && this.cachedState !== undefined) {
                this.props.cache.current.set(this.props.cacheKey.current, this.cachedState);
            }
        });
    }

    update() {
        if (this.props.cache.current && this.props.cacheKey.current) {
            if (this.props.cache.current.has(this.props.cacheKey.current)) {
                const state = this.props.cache.current.get(this.props.cacheKey.current);
                this.props.cache.current.delete(this.props.cacheKey.current);
                if (state !== undefined) {
                    this.restore(state);
                    const compatible: boolean = state.compatible(this.props);
                    if (compatible) {
                        return;
                    }
                }
            }
        }

        const promise = parseDiffViewerPatch(
            this.props.patch.current,
            this.props.syntaxHighlighting.current,
            this.props.syntaxHighlightingTheme.current,
            this.props.omitPatchHeaderOnlyHunks.current,
            this.props.wordDiffs.current,
        );
        this.cachedState = new ConciseDiffViewCachedState(promise, this.props);
        promise.then(
            () => {
                // Don't replace a potentially completed promise with a pending one, wait until the replacement is ready for smooth transitions
                this.diffViewerPatch = promise;
            },
            () => {
                // Propagate errors
                this.diffViewerPatch = promise;
            },
        );
    }

    restore(state: ConciseDiffViewCachedState) {
        this.diffViewerPatch = state.diffViewerPatch;
        this.cachedState = state;
    }
}

export type SearchSegment = {
    id?: number;
    text: string;
    highlighted: boolean;
};

export function makeSearchSegments(searchQuery: string, line: string, count: MutableValue<number>): SearchSegment[] {
    if (!searchQuery) {
        return [];
    }
    const searchQueryLower = searchQuery.toLowerCase();

    let lineOriginalCase = line;
    line = line.toLowerCase();

    if (line.length === 0) {
        return [];
    }

    const segments: SearchSegment[] = [];
    let idx = line.indexOf(searchQueryLower);
    if (idx === -1) {
        return [];
    }

    while (idx !== -1) {
        const before = line.slice(0, idx);
        const after = line.slice(idx + searchQueryLower.length);
        if (before.length > 0) {
            segments.push({ text: before, highlighted: false });
        }
        segments.push({ id: count.value, text: lineOriginalCase.slice(idx, idx + searchQueryLower.length), highlighted: true });
        count.value++;
        line = after;
        lineOriginalCase = lineOriginalCase.slice(idx + searchQueryLower.length);
        idx = line.indexOf(searchQueryLower);
    }

    if (line.length > 0) {
        segments.push({ text: line, highlighted: false });
    }

    return segments;
}

/**
 * Deterministic VCC-style region compiler types (dependency-free module).
 * @module dsh-compaction-instant/compiler
 */

/** One projected surface node: the durable seq plus its derived message. */
export interface CompileNode {
    seq: number;
    message: {
        role: 'system' | 'user' | 'assistant';
        content: readonly unknown[];
        source?: unknown;
    } | null;
}

/** Per-block budgets applied by one compile pass. */
export interface CompileBudgets {
    textTokens: number;
    userTextTokens: number;
    toolCallTokens: number;
    toolResultExcerptTokens: number;
}

/** Compiler-relevant resolved configuration (subset of the engine config). */
export interface CompilerConfig extends CompileBudgets {
    maxTokens: number;
    includeReasoning: boolean;
    stripNoiseXml: boolean;
    noisePatterns: readonly RegExp[];
    toolKeyFields?: Record<string, string>;
    /** Tools whose key argument is rendered in the one-liner; others are name-only. */
    toolArgTools?: readonly string[];
    /** Bookkeeping tools dropped from the checkpoint entirely. */
    hideTools?: readonly string[];
    /** Emit per-block diagnostics when true. */
    debug?: boolean;
    /** Optional debug line sink installed by the engine. */
    debugSink?: (line: string) => void;
    /** Session-wide checkpoint seq → ordinal map (1 = oldest), for `[checkpoint N]` elision lines. */
    checkpointOrdinals?: ReadonlyMap<number, number>;
}

/**
 * One compiled entry: an ordered line-group with its source seq and its
 * elision-priority kind. Kinds order the cap-elision passes: `result`, `tool`,
 * `media`, and `note` rows are dropped before `text`, `reasoning`, and
 * `checkpoint` rows, so conversation text survives a shrinking checkpoint
 * before the tool logs do.
 */
export interface CompileEntry {
    seq: number;
    text: string;
    kind: 'text' | 'reasoning' | 'tool' | 'result' | 'media' | 'note' | 'checkpoint';
}

export interface CompileStats {
    nodes: number;
    entries: number;
    toolCalls: number;
    toolResults: number;
    images: number;
    documents: number;
    reasoningElided: number;
    noiseElided: number;
    checkpoints: number;
    tokens: number;
    /** Low-value rows (tool/result/media/note) dropped by the first elision pass. */
    elidedToolRows: number;
    /** Remaining entries dropped by the second (oldest-first) elision pass. */
    elidedRows: number;
}

/** The VCC brief-mode noise XML patterns, as regex sources. */
export declare const DEFAULT_NOISE_PATTERNS: readonly string[];
/** Tool-name → preferred argument field for one-liners. */
export declare const DEFAULT_TOOL_KEY_FIELDS: Readonly<Record<string, string>>;
/** Tools whose key argument is rendered in the one-liner (default whitelist). */
export declare const DEFAULT_ARG_TOOLS: readonly string[];
/** Build marker proving which compiler revision produced a debug log. */
export declare const COMPILER_REV: string;
/** Join entries: single newlines between consecutive tool rows, blank lines elsewhere. */
export declare function joinCompiledEntries(entries: readonly (string | { seq: number; text: string; kind?: string })[]): string;

export declare function tokenize(text: string): string[];
export declare function countTokens(text: string): number;
export declare function estimateEntryTokens(text: string): number;
export declare function sanitize(text: unknown): string;
export declare function truncateTokens(text: string, limit: number, ref?: string): { text: string; truncated: boolean };
export declare function compileNoisePatterns(sources: readonly string[]): RegExp[];
export declare function stripNoiseXml(text: string, patterns: readonly RegExp[]): string;
export declare function pickToolKeyArg(name: string, input: unknown, keyFields: Record<string, string>): string | undefined;
export declare function parseToolArguments(argumentsRaw: string): unknown;
export declare function projectToolResultText(blocks: readonly unknown[]): string;
export declare function isCheckpointSource(source: unknown): boolean;
export declare function excerptToolResult(text: string, budget: number, ref: string): string;
export declare function entryText(entry: string | CompileEntry): string;
export declare function compileNodes(nodes: readonly CompileNode[], config: CompilerConfig, budgets?: CompileBudgets): { entries: CompileEntry[]; stats: CompileStats };
export declare function compileRegion(nodes: readonly CompileNode[], config: CompilerConfig): { entries: CompileEntry[]; stats: CompileStats; capped: boolean };
export declare function frameCheckpoint(entries: readonly (string | CompileEntry)[], headerLine?: string): { type: 'text'; text: string }[];
export declare const CHECKPOINT_PREAMBLE: string;
export declare const CHECKPOINT_OPEN_TAG: string;
export declare const CHECKPOINT_CLOSE_TAG: string;
/** Model-facing guide framed into the head of every checkpoint. */
export declare const RECALL_GUIDE: string;

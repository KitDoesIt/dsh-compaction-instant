/**
 * Same-session recall core types for dsh-compaction-instant.
 * @module dsh-compaction-instant/recall
 */

/** Default total budget for one recall operation, in density-aware tokens. */
export declare const DEFAULT_MAX_RECALL_TOKENS: number;
/** Widest single range accepted from one selection. */
export declare const MAX_RECALL_SPAN: number;

/** One inclusive seq range parsed from a selection string. */
export interface SeqSelection {
    start: number;
    end: number;
}

/** One recalled entry: the source seq and its full (possibly budget-cut) text. */
export interface RecallEntry {
    seq: number;
    text: string;
    truncated?: boolean;
}

/** Result of one recall operation over a session log. */
export interface RecallResult {
    /** All entries joined with blank lines — the model-facing text. */
    text: string;
    /** Per-seq entries in request order. */
    entries: RecallEntry[];
    /** Seq numbers whose original content was actually included. */
    seqs: number[];
    /** Number of requested seqs included. */
    recalled: number;
    /** Number of requested seqs absent from the session log. */
    missing: number;
    /** Number of further requested seqs beyond the token budget. */
    skipped: number;
    /** Whether any entry was cut by the budget. */
    truncated: boolean;
    /** Density-aware token total of the joined text. */
    tokens: number;
}

/** Session-shaped value recall reads from. */
export interface RecallableSession {
    events: readonly { seq: number; type: string; data: unknown }[];
    deriveEventMessage?(event: unknown): { role: 'system' | 'user' | 'assistant'; content: readonly unknown[] } | null;
}

/** Parse one seq selection string into ordered inclusive ranges. */
export declare function parseSeqSpec(input: string): { selections: SeqSelection[]; errors: string[] };
/** Project one derived message into full plain text (nothing elided but media). */
export declare function projectMessageText(message: { role: string; content: readonly unknown[] }): string;
/** Expand ordered selections into a deduplicated ordered seq list. */
export declare function expandSelections(selections: readonly SeqSelection[]): number[];
/** Collect the seqs of every landed checkpoint node, oldest first (1 = oldest compaction). */
export declare function findCheckpointSeqs(session: RecallableSession): number[];
/** Resolve one typed recall reference (`seq` / `result` / `checkpoint`) into seq ranges. */
export declare function resolveRecallReference(session: RecallableSession, type: 'seq' | 'result' | 'checkpoint' | string, id: string): { selections: SeqSelection[]; errors: string[] };
/** Recall the full original content of the requested seqs from one session log. */
export declare function recallSession(session: RecallableSession, selections: readonly SeqSelection[], config: { maxRecallTokens: number }): RecallResult;

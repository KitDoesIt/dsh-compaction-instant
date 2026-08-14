/**
 * Keyword/regex search over the durable session log types.
 * @module dsh-compaction-instant/search
 */

/** Default cap on the number of matching events shown in one result. */
export declare const DEFAULT_MAX_SEARCH_HITS: number;
/** Default cap on shown matching lines per hit event. */
export declare const MAX_LINES_PER_HIT: number;

/** A search pattern that cannot be compiled into a regular expression. */
export declare class InvalidSearchPatternError extends Error {
    readonly source: string;
    constructor(source: unknown, reason: string);
}

/** One search hit: the durable seq, its kind, and the rendered matched lines. */
export interface SearchHit {
    seq: number;
    kind: string;
    text: string;
}

/** Result of one search over a session log. */
export interface SearchResult {
    /** Compiled pattern source (after trimming). */
    pattern: string;
    /** Events containing at least one matching line. */
    totalMatches: number;
    /** Rendered hits (bounded by `maxSearchHits` and the token budget). */
    hits: SearchHit[];
    /** Matching events beyond the shown cap. */
    omitted: number;
    /** Whether hits were dropped or cut by the budget. */
    truncated: boolean;
    /** Density-aware token total of the rendered hits. */
    tokens: number;
    /** The joined model-facing text. */
    text: string;
}

/** Session-shaped value search reads from. */
export interface SearchableSession {
    events: readonly { seq: number; type: string; data: unknown }[];
    deriveEventMessage?(event: unknown): { role: string; content: readonly unknown[] } | null;
}

/** Compile one search pattern (case-insensitive, Unicode-aware regex). */
export declare function compileSearchPattern(source: unknown): RegExp;
/** Search the durable log; returns matching events with their seq pointers. */
export declare function searchSession(session: SearchableSession, patternSource: string, config: { maxRecallTokens: number; maxSearchHits: number }): SearchResult;

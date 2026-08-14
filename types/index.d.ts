/**
 * Instant replay-aware compaction backend types: VCC-style deterministic
 * context compilation for the DeepSeek Harness.
 * @module dsh-compaction-instant
 */
import type { Context } from '@deepseek-ai/cordis';
import type z from '@deepseek-ai/schemastery';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CompactionEngine as CompactionEngineBase, CompactionResult } from '@deepseek-ai/dsh-compaction';
import type { Session } from '@deepseek-ai/dsh-session';

/** Per-target pressure/retention overrides, mirroring compaction-basic's shape. */
export interface ModelPolicyOverride {
    provider: string;
    model: string;
    thresholdRatio?: number;
    retainRatio?: number;
    retainTokens?: number;
    /** Accepted for drop-in configuration compatibility; inert in this backend. */
    summarizationProvider?: string;
    /** Accepted for drop-in configuration compatibility; inert in this backend. */
    summarizationModel?: string;
    /** Checkpoint total cap for the exact target (unused by the shared cap). */
    maxTokens?: number;
    compactionRetries?: number;
    maxOverflowRetries?: number;
}

/** Public plugin configuration, all fields optional. */
export interface InstantCompactionConfig {
    /** Request-pressure fraction that triggers automatic compaction. Default 0.8. */
    thresholdRatio?: number;
    /** Verbatim-tail retention fraction. Default 0.16. */
    retainRatio?: number;
    /** Exact recent-tail retention budget; mutually exclusive with retainRatio. */
    retainTokens?: number;
    /** Verbatim-tail fraction a manual `/compact` keeps outside the compiled span. Default 0.15. */
    manualRetainRatio?: number;
    /** Exact manual-compaction tail budget; mutually exclusive with manualRetainRatio. */
    manualRetainTokens?: number;
    /** Accepted for drop-in configuration compatibility; the backend never routes a model. */
    summarizationProvider?: string;
    /** Accepted for drop-in configuration compatibility; the backend never routes a model. */
    summarizationModel?: string;
    /** Total cap for one compiled checkpoint, in compiler tokens. Default 8192. */
    maxTokens?: number;
    /**
     * Effective-cap fraction of the shadowed token count: the compiled
     * checkpoint is capped at max(maxTokens, shadowed × checkpointScale),
     * ceilinged at checkpointCap. Default 0.1.
     */
    checkpointScale?: number;
    /** Absolute ceiling for the scaled checkpoint cap, in compiler tokens. Default 65536. */
    checkpointCap?: number;
    /** Automatic compaction retry attempts per threshold crossing. Default 1. */
    compactionRetries?: number;
    /** Context-overflow recovery retry budget. Default 1. */
    maxOverflowRetries?: number;
    modelPolicies?: ModelPolicyOverride[];
    /** Enable automatic pressure/overflow compaction. Default true. */
    auto?: boolean;
    /** Per assistant-text-block token budget for the compiled view. Default 512. */
    textTokens?: number;
    /** Per user-text-block token budget for the compiled view. Default 1024. */
    userTextTokens?: number;
    /** Per tool-call one-liner token budget. Default 128. */
    toolCallTokens?: number;
    /** Accepted for drop-in compatibility; tool results no longer occupy entries (inert). */
    toolResultExcerptTokens?: number;
    /** Keep reasoning blocks in the compiled view. Default false. */
    includeReasoning?: boolean;
    /** Strip known noise XML wrappers from user text. Default true. */
    stripNoiseXml?: boolean;
    /** Noise XML regex sources applied with the `s` flag. */
    noisePatterns?: string[];
    /** Tool-name → preferred argument field for one-liners, merged over built-ins. */
    toolKeyFields?: Record<string, string>;
    /**
     * Tools whose key argument is rendered in the one-liner; every other tool
     * shows name-only. Defaults to the necessary set (read/write/edit/glob/
     * grep/bash/shell/web_search/skill/subagent/…).
     */
    toolArgTools?: string[];
    /** Bookkeeping tools to drop from the checkpoint entirely (VCC `_BRIEF_HIDE_TOOLS`). Default none. */
    hideTools?: string[];
    /** Enable per-compile diagnostics to the debug log and stderr. Default false. */
    debug?: boolean;
    /** Debug log file path. Defaults to `$DSH_HOME/compaction-debug.log`. */
    debugLogPath?: string;
}

/** Resolved, validated, frozen configuration after {@link resolveConfig}. */
export interface ResolvedInstantCompactionConfig {
    readonly thresholdRatio: number;
    readonly retainRatio?: number;
    readonly retainTokens?: number;
    readonly manualRetainRatio: number;
    readonly manualRetainTokens?: number;
    readonly maxTokens: number;
    readonly checkpointScale: number;
    readonly checkpointCap: number;
    readonly compactionRetries: number;
    readonly maxOverflowRetries: number;
    readonly modelPolicies: readonly ModelPolicyOverride[];
    readonly auto: boolean;
    readonly textTokens: number;
    readonly userTextTokens: number;
    readonly toolCallTokens: number;
    readonly toolResultExcerptTokens: number;
    readonly includeReasoning: boolean;
    readonly stripNoiseXml: boolean;
    readonly noisePatterns: readonly RegExp[];
    readonly toolKeyFields: Readonly<Record<string, string>>;
    readonly toolArgTools: readonly string[];
    readonly hideTools: readonly string[];
    readonly debug: boolean;
    readonly debugLogPath: string;
    /** File-appending line sink installed when `debug` is enabled. */
    readonly debugSink?: (line: string) => void;
}

/** Target-specific pressure configuration failure eligible for warning suppression. */
export declare class TargetPressureConfigError extends Error {
    readonly targetKey: string;
    constructor(targetKey: string, message: string);
}

/** Validate and resolve the plugin configuration. */
export declare function resolveConfig(config?: InstantCompactionConfig): ResolvedInstantCompactionConfig;
/** Resolve the verbatim tail a manual compaction keeps outside the compiled span. */
export declare function resolveManualRetainTokens(config: ResolvedInstantCompactionConfig, measurement: { totalTokens: number }): number;
/** Merge the exact provider/model override over the validated default policy. */
export declare function resolveTargetPolicy(config: ResolvedInstantCompactionConfig, target: { provider: string; model: string }): unknown;
/** Scale one routed policy into concrete token budgets for its model capacity. */
export declare function resolveCompactSpec(policy: unknown, contextWindow: number): unknown;
/** Resolve the exact provider/model durably routed for the latest request. */
export declare function routedTarget(session: Session): { provider: string; model: string } | undefined;

/** Backend provenance recorded on the `compaction/summary` event. */
export declare const COMPILER_PROVIDER: string;
export declare const COMPILER_MODEL: string;

/** One ordered compiled region, returned by the `compile` hook. */
export interface CompiledRegion {
    /** Ordered `{ seq, text }` entries, newest last. */
    entries: { seq: number; text: string }[];
    /** Compile statistics including the density-aware token total. */
    stats: {
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
        elidedToolRows: number;
        elidedRows: number;
    };
    /** Whether the total cap forced budget rescaling or front elision. */
    capped: boolean;
    provider: string;
    model: string;
}

/**
 * Deterministic compaction backend using `ctx.tokenMeter` for pressure and
 * the offline VCC-style compiler instead of an LLM summarizer. Drop-in
 * replacement for `@deepseek-ai/dsh-compaction-basic` at the `ctx.compaction`
 * seam.
 */
export declare class InstantCompactionEngine extends CompactionEngineBase {
    static inject: string[];
    static Config: z<InstantCompactionConfig>;
    readonly config: ResolvedInstantCompactionConfig;
    constructor(ctx: Context, config?: InstantCompactionConfig);
    /** Resolve the effective total cap for one compiled checkpoint. */
    effectiveMaxTokens(shadowedTokenCount: number): number;
    /** Compile one priced region with the deterministic compiler; the sole subclass hook. */
    compile(prepared: {
        shadowedSeqs: readonly number[];
        session: Session;
        [key: string]: unknown;
    }, agent: Agent | undefined, signal: AbortSignal | undefined): Promise<CompiledRegion>;
    /** Compact for step-boundary pressure or provider-confirmed context overflow. */
    compactIfNeeded(agent: Agent, trigger: 'pressure' | 'context-overflow', signal: AbortSignal): Promise<CompactionResult | null>;
    /** Compact one inclusive positional range from the agent-owned surface. */
    compactRegion(start: number, end: number, agent: Agent, signal: AbortSignal): Promise<CompactionResult>;
    /** Force one useful idle-session compaction below the pressure threshold. */
    compactNow(agent: Agent, signal: AbortSignal, sourceCommandId?: string): Promise<CompactionResult | null>;
}

export default InstantCompactionEngine;

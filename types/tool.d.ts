/**
 * Model-facing same-session recall tool types: `recall` (typed restore) and
 * `search` (keyword/regex grep) over the durable log.
 * @module dsh-compaction-instant/tool
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';

/** Cordis companion plugin name. */
export declare const name: 'tool-recall';
/** Service required before the companion can register. */
export declare const inject: string[];
/** Tool plugin configuration. */
export interface ToolRecallConfig {
    /** Total budget for one recall/search operation, in density-aware tokens. Default 16000. */
    maxRecallTokens?: number;
    /** Cap on shown matching events per search. Default 50. */
    maxSearchHits?: number;
}
/** Validate and default the tool plugin configuration. */
export declare function resolveConfig(config?: ToolRecallConfig): Required<ToolRecallConfig>;
/** Register the recall tools; returns the combined disposer. */
export declare function apply(ctx: Context, config?: ToolRecallConfig): void;
/** The typed `recall` tool definition (type: seq | result | checkpoint). */
export declare function defineRecallTool(config: Required<ToolRecallConfig>): ToolDefinition;
/** The grep `search` tool definition (for tests and introspection). */
export declare function defineSearchTool(config: Required<ToolRecallConfig>): ToolDefinition;

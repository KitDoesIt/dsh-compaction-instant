/**
 * Human `/recall` command types (grep-based search over the durable log).
 * @module dsh-compaction-instant/command
 */
import type { Context } from '@deepseek-ai/cordis';
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';

/** Cordis companion plugin name. */
export declare const name: 'command-recall';
/** Service required before the companion can register. */
export declare const inject: string[];
/** Command plugin configuration. */
export interface CommandRecallConfig {
    /** Total budget for one search result, in density-aware tokens. Default 16000. */
    maxRecallTokens?: number;
    /** Cap on shown matching events per search. Default 50. */
    maxSearchHits?: number;
}
/** Validate and default the command plugin configuration. */
export declare function resolveConfig(config?: CommandRecallConfig): Required<CommandRecallConfig>;
/** Build the `recall` command definition (for tests and introspection). */
export declare function defineRecallCommand(resolved: Required<CommandRecallConfig>): CommandDefinition;
/** Register the `recall` command; returns the installed registration's disposer. */
export declare function apply(ctx: Context, config?: CommandRecallConfig): void;

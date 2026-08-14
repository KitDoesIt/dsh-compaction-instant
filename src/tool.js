/**
 * Model-facing same-session recall tools for `dsh-compaction-instant`.
 *
 * Two complementary entry points over the durable session log:
 *
 *   - `recall` — restore the exact original content of earlier events by a
 *     typed reference: `type: "seq"` for `(seq N)` / `(seqs A-B)` markers,
 *     `type: "result"` for the `result N` pointer on a tool-call one-liner,
 *     `type: "checkpoint"` for a `[checkpoint N]` elision line.
 *   - `search` — keyword/regex search over the log. Returns the matching
 *     events with their `(seq N)` pointers, so the agent can then call
 *     `recall` to restore any hit in full.
 *
 * Neither call does a model round-trip and neither paraphrases: the log is
 * append-only, so the output is always the original content.
 *
 * Registered as the `recall` and `search` tools on any context providing
 * `tools`.
 * @module dsh-compaction-instant/tool
 */
import { HarnessError } from "@deepseek-ai/dsh-llm";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { DEFAULT_MAX_RECALL_TOKENS, recallSession, resolveRecallReference } from "./recall.js";
import { DEFAULT_MAX_SEARCH_HITS, InvalidSearchPatternError, searchSession } from "./search.js";

export const name = "tool-recall";
export const inject = ["tools"];

/** Validate and default the tool plugin configuration. */
export function resolveConfig(config = {}) {
  const maxRecallTokens = config.maxRecallTokens ?? DEFAULT_MAX_RECALL_TOKENS;
  const maxSearchHits = config.maxSearchHits ?? DEFAULT_MAX_SEARCH_HITS;
  if (typeof maxRecallTokens !== "number" || !Number.isInteger(maxRecallTokens) || maxRecallTokens <= 0) throw new Error("ToolRecallConfig: maxRecallTokens must be a positive integer");
  if (typeof maxSearchHits !== "number" || !Number.isInteger(maxSearchHits) || maxSearchHits <= 0) throw new Error("ToolRecallConfig: maxSearchHits must be a positive integer");
  return { maxRecallTokens, maxSearchHits };
}

const RECALL_DESCRIPTION = "Restore the exact original content of earlier events in THIS conversation by a typed reference. type=\"seq\" with a seq selection id (\"3-7,15\", \"seq 12\", \"seqs 3-7\" — the checkpoint marker forms) restores those events; type=\"result\" with the \"result N\" pointer from a tool-call one-liner (\"result 3\" or \"3\") restores that tool result; type=\"checkpoint\" with an ordinal (\"1\" = oldest, as in a \"[checkpoint N]\" elision line) or a \"seq N\" pointer restores that full checkpoint. The durable log is append-only, so recalled content is always the original tokens. To find events by keyword or regex instead, use the search tool.";

const SEARCH_DESCRIPTION = "Search THIS conversation's durable event log by keyword or regular expression (case-insensitive, Unicode-aware). Every event ever recorded is searchable, including content elided or truncated by compaction checkpoints — the log is append-only and untouched. Returns the matching events with their (seq N) seq numbers and the matching lines. Then call recall with a (seq N) pointer to restore any hit's full exact original content. Escape regex special characters (e.g. use \\\\( for a literal parenthesis).";

const RECALL_OUTPUT = {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      text: { type: "string", required: true },
      recalled: { type: "integer", required: true },
      missing: { type: "integer", required: true },
      skipped: { type: "integer", required: true },
      truncated: { type: "boolean", required: true },
      tokens: { type: "integer", required: true }
    }
  },
  render: (_args, value) => [{ type: "text", text: value.text }]
};

const SEARCH_OUTPUT = {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      text: { type: "string", required: true },
      pattern: { type: "string", required: true },
      totalMatches: { type: "integer", required: true },
      omitted: { type: "integer", required: true },
      truncated: { type: "boolean", required: true },
      tokens: { type: "integer", required: true }
    }
  },
  render: (_args, value) => [{ type: "text", text: value.text }]
};

/** Shared execution of one typed recall request against the calling agent. */
function executeRecall(exec, type, id, resolved) {
  const agent = exec.agent;
  if (agent === undefined) throw new HarnessError("recall requires a calling agent with a session", "RECALL_AGENT_REQUIRED");
  const { selections, errors } = resolveRecallReference(agent.session, type, id);
  if (errors.length > 0) throw new HarnessError(`invalid ${type} recall: ${errors.join("; ")}`, "RECALL_INVALID_SELECTION");
  const recalled = recallSession(agent.session, selections, resolved);
  return {
    text: recalled.text,
    recalled: recalled.recalled,
    missing: recalled.missing,
    skipped: recalled.skipped,
    truncated: recalled.truncated,
    tokens: recalled.tokens
  };
}

/**
 * Build the typed `recall` tool definition against one resolved config.
 * @param resolved - validated `{ maxRecallTokens, maxSearchHits }`.
 * @returns a registry-ready ToolDefinition.
 */
export function defineRecallTool(resolved) {
  return defineTool({
    name: "recall",
    description: RECALL_DESCRIPTION,
    parameters: {
      type: {
        type: "string",
        required: true,
        enum: ["seq", "result", "checkpoint"],
        description: 'Reference type: "seq" for events by sequence number, "result" for a tool result by its `result N` pointer, "checkpoint" for a whole checkpoint by ordinal or seq.'
      },
      id: {
        type: "string",
        required: true,
        description: 'Type-dependent reference: "3-7,15" / "seq 12" for seq; "result 3" or "3" for result; "1" / "checkpoint 1" or "seq 12345" for checkpoint.'
      }
    },
    output: RECALL_OUTPUT,
    execute: (args, exec) => executeRecall(exec, args.type, args.id, resolved),
    presentCall: (args) => ({
      card: "generic",
      title: "Recall events",
      kind: "read",
      rawInput: `${args.type} ${args.id}`
    })
  });
}

/**
 * Build the `search` (grep) tool definition against one resolved config.
 * @param resolved - validated `{ maxRecallTokens, maxSearchHits }`.
 * @returns a registry-ready ToolDefinition.
 */
export function defineSearchTool(resolved) {
  return defineTool({
    name: "search",
    description: SEARCH_DESCRIPTION,
    parameters: {
      pattern: {
        type: "string",
        required: true,
        description: "Keyword or regular expression to search for (case-insensitive). Escape regex special characters."
      }
    },
    output: SEARCH_OUTPUT,
    execute(args, exec) {
      const agent = exec.agent;
      if (agent === undefined) throw new HarnessError("search requires a calling agent with a session", "RECALL_AGENT_REQUIRED");
      let result;
      try {
        result = searchSession(agent.session, args.pattern, resolved);
      } catch (error) {
        if (error instanceof InvalidSearchPatternError) throw new HarnessError(error.message, "SEARCH_INVALID_PATTERN", { cause: error });
        throw error;
      }
      return {
        text: result.text,
        pattern: result.pattern,
        totalMatches: result.totalMatches,
        omitted: result.omitted,
        truncated: result.truncated,
        tokens: result.tokens
      };
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Search history",
      kind: "read",
      rawInput: args.pattern
    })
  });
}

/**
 * Register the recall tools (`recall` restore + `search` grep).
 * @param ctx - context carrying the tools service.
 * @param config - `{ maxRecallTokens?, maxSearchHits? }`.
 * @returns the installed registrations' combined disposer.
 */
export function apply(ctx, config) {
  const resolved = resolveConfig(config);
  ctx.effect(() => {
    const disposers = [
      ctx.tools.register(defineRecallTool(resolved)),
      ctx.tools.register(defineSearchTool(resolved))
    ];
    return () => {
      for (const dispose of disposers) dispose();
    };
  });
}

export { DEFAULT_MAX_RECALL_TOKENS, RECALL_DESCRIPTION, SEARCH_DESCRIPTION };

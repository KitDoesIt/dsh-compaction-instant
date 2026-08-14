# dsh-compaction-instant

[English](README.md) | [简体中文](README.zh-CN.md)

Instant, near-lossless context compaction for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — a **drop-in replacement for `@deepseek-ai/dsh-compaction-basic`** that replaces LLM summarization with the deterministic conversation-compiler principle of [lllyasviel/VCC](https://github.com/lllyasviel/VCC).

A compaction compresses a shadowed history span in **milliseconds, with zero model calls**, keeping **original tokens only** — no paraphrase, no hallucination, no summarizer cost. Everything that is cut is still recoverable through `(seq N)` pointers into the durable session log.

## Example

A region containing a user request, an assistant text + tool call, and its result compiles to:

```
[user]
please fix the bug
[assistant]
on it
* read "a.js" (seq 2 -> result 3)
[user]
next question
```

Every tool call is ONE line: the key argument for whitelisted tools (`toolArgTools`), name-only for the rest (`* job_kill (seq 9 -> result 10)`), nothing at all for `hideTools` rows. Tool results never occupy entries — the `-> result N` pointer keeps them one `recall(type:"result")` away. Long user/assistant text is truncated to its budget with `...(truncated from seq N)`; every elision names the durable event that still holds the full content.

## Recall: the lossless read-back layer

The package also ships the counterparts that close the near-lossless loop — **same-session recall** for the agent and the human. Because the session log is append-only, every token the compiler ever elided is still recoverable:

| Entry point | Module | What it does |
|---|---|---|
| `recall` **tool** (model-facing) | `dsh-compaction-instant/tool` | Typed restore: `type:"seq"` with `(seq N)`/`(seqs A-B)` markers, `type:"result"` with the `result N` pointer, `type:"checkpoint"` with a `[checkpoint N]` ordinal — restores exact original content into the current tool result |
| `search` **tool** (model-facing, grep) | `dsh-compaction-instant/tool` | Keyword/regex search over the whole durable log — including content elided by compaction — returning matching events with their `(seq N)` pointers, ready for `recall` |
| `/recall` **command** (human, grep) | `dsh-compaction-instant/command` | `/recall <keyword|regex>` appends a durable `form: "recall"` user message with the matching events and their seq pointers, so the next model turn sees them |
| Shared cores | `dsh-compaction-instant/recall` + `dsh-compaction-instant/search` | Seq parsing (`12`, `3-7`, `seq 12` / `seqs 3-7`), log expansion, budgets, projection; regex compilation and hit rendering |

Recall keeps **everything**: text, reasoning, raw tool-call arguments, nested tool-result content; log-only events render as labeled data dumps; missing seqs are reported; a `maxRecallTokens` budget (default **16000**) cuts with a provenance marker and counts the skipped remainder; searches cap shown hits (`maxSearchHits`, default **50**). Both plugins are separate rows, so they can be mounted next to **any** compaction backend — they only read the durable log.

Every checkpoint also frames a short **RECALL guide** at its head, telling the model exactly how to use `recall` / `search` to recover elided content. When a prior checkpoint is elided under cap pressure it never vanishes silently: it leaves a single `[checkpoint N]` line (N = compaction ordinal, 1 = oldest), which `recall(type:"checkpoint", id:"N")` restores in full.

## Configuration

All fields optional; defaults shown.

| Key | Default | Meaning |
|---|---|---|
| `thresholdRatio` | `0.5` | Fraction of the routed model's context window that triggers automatic compaction |
| `retainRatio` | `0.05` | Fraction of the context window kept verbatim at the surface tail |
| `retainTokens` | — | Exact tail budget; mutually exclusive with `retainRatio` |
| `manualRetainRatio` | `0.05` | Fraction of the measured surface kept verbatim by a manual `/compact` (so the recent conversation is never compiled away) |
| `manualRetainTokens` | — | Exact manual tail budget; mutually exclusive with `manualRetainRatio` |
| `auto` | `true` | Register `agent/pre-step` pressure and `agent/request-error` overflow recovery |
| `maxTokens` | `8192` | Floor of the total cap for one compiled checkpoint (density-aware tokens) |
| `checkpointScale` | `0.1` | The effective cap is `max(maxTokens, shadowed × checkpointScale)`, ceilinged at `checkpointCap` — a large span never crushes every entry into a sliver |
| `checkpointCap` | `32768` | Absolute ceiling of the scaled checkpoint cap |
| `textTokens` | `512` | Budget per assistant text block |
| `userTextTokens` | `1024` | Budget per user text block |
| `toolCallTokens` | `128` | Budget per tool-call one-liner (never rescaled — see the elision rules) |
| `toolResultExcerptTokens` | `256` | Accepted for compatibility; **inert** — tool results no longer occupy entries |
| `includeReasoning` | `false` | Keep reasoning blocks in the checkpoint |
| `stripNoiseXml` | `true` | Strip configured noise wrappers from user text |
| `noisePatterns` | see compiler | Noise XML regex sources, applied with the `s` flag |
| `toolKeyFields` | built-ins | Extra tool-name → argument-field map for one-liners |
| `toolArgTools` | see compiler | Whitelist whose key argument renders in the one-liner (`read`/`write`/`edit`/`glob`/`grep`/`bash`/`shell`/`web_search`/`skill`/`subagent`/…); every other tool is name-only |
| `hideTools` | — | Bookkeeping tools dropped from the checkpoint entirely |
| `modelPolicies` | — | Per provider/model overrides of `thresholdRatio`/`retain*` (basic-compatible shape) |
| `compactionRetries` / `maxOverflowRetries` | `1` / `1` | Retry budgets, same semantics as basic |
| `summarizationProvider` / `summarizationModel` | — | Accepted for config drop-in compatibility; **inert** — this backend never routes a model |

The tool and command plugins each take their own `{ maxRecallTokens?: 16000, maxSearchHits?: 50 }` config.

> **Cordis config gotcha:** the plugin row's config passes through the schemastery schema, whose `~standard` adapter injects **`[]` for every absent array key** (`toolArgTools`, `hideTools`, `noisePatterns`, `toolKeyFields`, `modelPolicies`). The resolver treats an empty list as *unset* and falls back to the defaults — so a missing `toolArgTools` keeps the built-in whitelist (never disable it by writing `toolArgTools: []`; empty means default). `debug: true` writes per-compile diagnostics to the configured `debugLogPath` (default `$DSH_HOME/compaction-debug.log`).

Budgets are enforced twice — by token count and by a `budget × 4` character ceiling — so pathological unbroken runs (base64 blobs, minified files) cannot bypass them. Tool calls are **always one line**: they are never rescaled, and the cap loop shrinks only the conversation-text budgets (floor **32 tokens** each). If the compiled region still exceeds the (scaled) cap, the oldest **tool rows** are removed first (`[N tool/result entries elided: seqs a-b]`), and only then the oldest remaining entries (`[N earlier entries elided: seqs a-b]`) — tool calls can never squeeze the dialogue out. The newest content always survives.

### Tokenizer and multilingual behavior

The tokenizer is a character-class heuristic: ASCII letter runs and digit runs count as one token each, punctuation is per-character, whitespace is free, and every other code unit is its own token. Concretely:

| Content | Tokens |
|---|---|
| CJK (`你好，世界！`) | 1 per code point (6) |
| Cyrillic / Arabic | 1 per code unit |
| Accented Latin (`café`) | ASCII runs stay grouped (`caf` + `é`) |
| Emoji (`😀`) | 2 (surrogate pair) |

Every truncation, excerpt, and cap cut is taken at a **code-point boundary** — a slice never leaves a lone surrogate half, so emoji and other astral characters always reach the model intact (pinned by `test/multilang.test.js`). The character-density ceiling uses UTF-16 length, which is the conservative side for astral content.

The harness token meter (used for the shrink guarantee and `/compact` reporting) is a separate `chars / 4 + block overhead` estimator; the two deliberately coexist — see the top-level design notes.

## Guarantees

- **Instant** — the compile is a single deterministic pass over the shadowed nodes; no network, no model, no KV-cache concerns.
- **Near-lossless** — output contains only original tokens; every cut is marked and points at its durable `seq`; prior checkpoints are copied verbatim.
- **Contract-exact drop-in** — identical seam, events, provenance, pricing (via the singleton `ctx.tokenMeter`), and failure vocabulary as `compaction-basic`, including the shrink guarantee (a checkpoint that would not reduce the surface is rejected).
- **Optional pruner compatible** — consumes the optional `toolResultPruner` service exactly like basic (it helps the *retained tail*; the compiler collapses the *shadowed* region).

## Installation

All three methods below install the package (published to npm as `dsh-compaction-instant`) with the harness's own plugin manager (which runs pnpm inside the profile directory, making the package resolvable to both the host composition and every agent preset):

```bash
dsh plugin --profile web add <spec>
```

`dsh-command-compact` (`/compact`) is backend-independent, so it keeps working unchanged in every method.

### Method 1 — Drop-in replace the built-in engine (alias)

```bash
dsh plugin --profile web add "@deepseek-ai/dsh-compaction-basic@npm:dsh-compaction-instant"
```

**dsh currently has no way to choose the compaction engine**, and the built-in agent presets (`standard`, `code`, `cordis`) pin the package name `@deepseek-ai/dsh-compaction-basic` in their compositions. To use this engine inside those built-in presets you therefore **masquerade as the built-in plugin**: preset rows resolve bare package names from the profile's `node_modules` (which outranks the harness installation), so installing our package under the built-in name makes every built-in preset load this engine automatically — no preset files are touched, and preset upgrades keep working.

The masquerade is safe by construction: this engine is a contract-exact drop-in — the same `ctx.compaction` seam, the **identical inject list** (`llm`, `tokenMeter`, `sessions`), the same event protocol and error vocabulary, and its `Config` accepts every key of basic's configuration surface. Removing the alias dependency restores the real basic.

### Method 2 — Direct install + AI-authored preset copy (dsh authoring mode)

```bash
dsh plugin --profile web add dsh-compaction-instant
```

Then open a session with the preset-authoring preset (the shipped `cordis` preset, "creation mode") and ask the AI to:

> Copy the `standard` preset and swap its compaction engine row to `dsh-compaction-instant`.

The AI uses `agentPresets.copy('standard', '<id>')` to create a locally authored preset, swaps the compaction row's `name` in the copy, mount-validates it with `standingKeyFor('<id>')`, and can set it as the default by patching the `agent-presets` row (`config.default: <id>`). The new preset appears in the UI picker; the built-in presets stay untouched.

### Method 3 — Direct install + manual preset configuration

```bash
dsh plugin --profile web add dsh-compaction-instant
mkdir -p "$DSH_HOME/.agent-presets/<id>"
# copy composition + metadata from the built-in preset you want as a base
# (the preset roster lists every preset's real path):
cp <built-in-preset>/agent.cordis.yml "$DSH_HOME/.agent-presets/<id>/agent.cordis.yml"
# write preset.yml beside it with name + description
```

Then hand-edit the copy's compaction group — one row name change, inside the same isolate realm:

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true      # the pruner must share this realm
  config:
    - id: compaction-instant
      name: dsh-compaction-instant   # was '@deepseek-ai/dsh-compaction-basic'
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    # ... keep the pruner row
```

Rules: never edit the shipped preset install; keep the isolate realm; a successful `standingKeyFor` mount (or simply starting a session on the preset) is the real validation — the roster's `broken` flag only catches parse errors.

### Shared patch layer (all methods)

The recall tools and `/recall` command are host-level rows; add them to the profile's `cordis.patch.yml` (new rows must ride an `insert` list; the file is hot-reloaded, no restart needed):

```yaml
- id: compaction-basic
  disabled: true                     # host-level swap (optional fallback)
- insert:
    - id: compaction-instant
      name: dsh-compaction-instant   # host fallback for presets without compaction (e.g. minimal)
    - id: tool-recall
      name: dsh-compaction-instant/tool
    - id: command-recall
      name: dsh-compaction-instant/command
```

| Method | Engine in built-in presets | Touches preset files | Extra preset in picker | Setup effort |
|---|---|---|---|---|
| **1. Alias replace** | ✅ automatic (standard/code/cordis) | no | no | one command |
| **2. AI-authored copy** | only the new preset | the copy | yes | one prompt + patch |
| **3. Manual preset** | only the new preset | the copy | yes | manual edit |

> Only one `ctx.compaction` implementation may be mounted per context (the seam documents "load one implementation per context"); preset mounts keep their own isolate realm, so host and preset instances never collide.

## Development

```bash
npm test        # node --test (compiler units, config validation, session integration, engine)
npm run check   # node --check over all sources
```

The package is dependency-light: `@deepseek-ai/schemastery` for the Config schema; everything else is a peer (the harness provides it). `src/compiler.js` is deliberately dependency-free so it is unit-testable without a running harness.

## Differences from compaction-basic

- No summarizer call → compaction latency goes from seconds to milliseconds; no summarizer token spend.
- No rephrasing → facts, file paths, commands, and identifiers survive byte-exact; the model continues on its own words.
- Deterministic → the same region always compiles to the same checkpoint.
- Prior checkpoints are copied verbatim instead of being re-summarized (cheap and lossless).
- Manual `/compact` keeps a verbatim recent tail (`manualRetainRatio`, default 0.05 of the measured surface) instead of compiling the whole history, so the active conversation is never compacted away; the compiled checkpoint only covers the older span.
- The `compaction/summary` event carries the **compiled entries themselves** — the UI's expandable checkpoint row shows exactly the body the model sees, wrapped in an **adaptive Markdown code fence** (the fence grows longer than any ``` inside, so messages containing markdown render as one tidy code block), and the checkpoint heads with a short RECALL guide telling the model how to recover elided content via `recall` / `search`.
- Trade-off: the checkpoint can be less *dense* than an LLM summary for prose-heavy history (facts are truncated, not merged). The verbatim tail (automatic `retainRatio` and manual `manualRetainRatio`) is where active work lives, and everything else stays recoverable through `(seq N)` pointers + recall.

MIT licensed.

/**
 * Settings-namespace integration tests for the instant compaction engine.
 * @module dsh-compaction-instant/test/settings
 */
import assert from "node:assert/strict";
import test from "node:test";
import { Context } from "@deepseek-ai/cordis";
import { InstantCompactionEngine } from "../src/index.js";

/**
 * The settings schema mirrors the engine's own defaults, so the resolved
 * settings layer is exactly what resolveConfig computes. These assertions
 * pin that contract: bumping an engine default must bump the schema default.
 */
test("SETTINGS_SCHEMA defaults mirror engine defaults", () => {
  const schema = InstantCompactionEngine.SETTINGS_SCHEMA;
  const resolved = schema({});
  assert.equal(resolved.checkpointScale, 0.1);
  assert.equal(resolved.checkpointCap, 65536);
  assert.equal(resolved.maxTokens, 8192);
  assert.equal(resolved.auto, true);
  // Environment-derived engine defaults are not baked into the schema.
  assert.equal(resolved.debug, undefined);
  assert.equal(resolved.debugLogPath, undefined);
});

test("SETTINGS_SCHEMA validates user overrides and rejects malformed values", () => {
  const schema = InstantCompactionEngine.SETTINGS_SCHEMA;
  assert.equal(schema({ checkpointScale: 0.25 }).checkpointScale, 0.25);
  assert.equal(schema({ checkpointCap: 131072 }).checkpointCap, 131072);
  assert.equal(schema({ auto: false }).auto, false);
  assert.equal(schema({ debug: true }).debug, true);
  assert.equal(schema({ debugLogPath: "/tmp/x.log" }).debugLogPath, "/tmp/x.log");
  assert.throws(() => schema({ checkpointCap: -1 }));
  assert.throws(() => schema({ checkpointCap: 1.5 }));
  assert.throws(() => schema({ checkpointScale: 1.5 }));
  assert.throws(() => schema({ auto: "yes" }));
});

test("settings values feed the engine through resolveConfig", () => {
  // A settings-layer value must survive the engine's validation and win over
  // the composition defaults once the source thunk is replaced. A real cordis
  // Context satisfies the Service base; no settings service is mounted, so
  // installSettingsSection's inject callback never runs.
  const engine = new InstantCompactionEngine(new Context(), {});
  engine.source = () => ({ checkpointCap: 131072, checkpointScale: 0.05, auto: false });
  engine._reloadConfig();
  assert.equal(engine.config.checkpointCap, 131072);
  assert.equal(engine.config.checkpointScale, 0.05);
  assert.equal(engine.config.auto, false);
  // Non-exposed fields keep the composition entry values under the swap.
  engine.source = () => ({ ...{ maxTokens: 4096 }, ...{ checkpointCap: 65536 } });
  engine._reloadConfig();
  assert.equal(engine.config.maxTokens, 4096);
  assert.equal(engine.config.checkpointCap, 65536);
});

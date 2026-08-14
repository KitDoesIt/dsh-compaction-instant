/**
 * Integration tests for the durable compaction transaction against a real
 * detached Session, a fake token meter, and a fake compile hook.
 * @module dsh-compaction-instant/test/region
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ManualCompactionError } from "@deepseek-ai/dsh-compaction";
import { createAssistantMessage, createToolResultMessage, createUserMessage } from "@deepseek-ai/dsh-llm";
import { Session } from "@deepseek-ai/dsh-session";
import { compactSurfaceRegion, fenceCode, selectCompactableRange, SurfaceChangedError } from "../src/region.js";

/** Build one detached session with a complete (idle) turn bracket. */
function makeIdleSession() {
  const user = createUserMessage({
    content: [{ type: "text", text: "please fix the bug" }],
    source: { kind: "user" }
  });
  const assistant = createAssistantMessage({
    content: [
      { type: "text", text: "on it" },
      { type: "tool-call", id: "call-1", name: "read", arguments: '{"file_path":"a.js"}' }
    ],
    source: { provider: "p", model: "m" }
  });
  const result = createToolResultMessage({
    callId: "call-1",
    content: [{ type: "text", text: "file content" }],
    isError: false
  });
  const assistant2 = createAssistantMessage({
    content: [{ type: "text", text: "done" }],
    source: { provider: "p", model: "m" }
  });
  const user2 = createUserMessage({
    content: [{ type: "text", text: "thank you" }],
    source: { kind: "user" }
  });
  const seed = [
    { type: "turn/start", seq: 0, time: 1, data: { turn: 1 } },
    { type: "user/message", seq: 1, time: 2, data: user, surfaceOp: "append" },
    { type: "assistant/message", seq: 2, time: 3, data: { message: assistant }, surfaceOp: "append" },
    { type: "tool/result", seq: 3, time: 4, data: { message: result }, surfaceOp: "append" },
    { type: "assistant/message", seq: 4, time: 5, data: { message: assistant2 }, surfaceOp: "append" },
    { type: "user/message", seq: 5, time: 6, data: user2, surfaceOp: "append" },
    { type: "turn/end", seq: 6, time: 7, data: { turn: 1 } }
  ];
  return Session.create("session-1", seed);
}

/** Static fake meter pricing 100 tokens per surface node and 10 for any message. */
function makeFakeMeter() {
  return {
    measure: (session) => {
      const nodes = session.surface.nodes.map((seq) => ({ seq, tokens: 100 }));
      return {
        logRevision: 0,
        baseline: { kind: "none", tokens: 0 },
        surfaceDeltaTokens: 0,
        totalTokens: nodes.length * 100,
        surfaceTokens: nodes.length * 100,
        nodes
      };
    },
    estimateMessage: () => 10
  };
}

const fakeCompile = async () => ({
  entries: [{ seq: 1, text: "[user]\ncompiled body" }],
  stats: { tokens: 3 },
  capped: false,
  provider: "test-provider",
  model: "test-compiler"
});

test("selectCompactableRange retains the priced tail and balances tool pairs", () => {
  const session = makeIdleSession();
  const measurement = makeFakeMeter().measure(session);
  // Retaining >= 250 tokens keeps the last 3 nodes; the cut before the
  // tool/result node is not balanced, so the range recedes to node 1 only.
  const range = selectCompactableRange(session, measurement, 250);
  assert.deepEqual([range.start, range.end], [1, 1]);
  // Retaining 0 keeps only the last node; the cut before it is balanced.
  const full = selectCompactableRange(session, measurement, 0);
  assert.deepEqual([full.start, full.end], [1, 4]);
});

test("compactSurfaceRegion runs a complete manual transaction with a flush", async () => {
  const session = makeIdleSession();
  const meter = makeFakeMeter();
  let flushed = 0;
  const result = await compactSurfaceRegion({ meter, compile: fakeCompile }, session, 1, 4, undefined, {
    owner: null,
    stability: "selected-span",
    flush: async () => {
      flushed += 1;
    }
  }, undefined);
  assert.equal(flushed, 1);
  assert.deepEqual(result.shadowedSeqs, [1, 2, 3, 4]);
  assert.equal(result.shadowedTokenCount, 400);
  assert.deepEqual(result.shadowedRange, { start: 1, end: 4 });
  // The UI-facing summary is the compiled body in one adaptive code fence.
  assert.deepEqual(result.summary, [{ type: "text", text: "```\n[user]\ncompiled body\n```" }]);
  const events = session.events;
  const startEvent = events[result.startSeq];
  const summaryEvent = events[result.summarySeq];
  const endEvent = events[result.endSeq];
  assert.equal(startEvent.type, "compaction/start");
  assert.equal(summaryEvent.type, "compaction/summary");
  assert.equal(endEvent.type, "compaction/end");
  assert.equal(summaryEvent.data.compactionId, startEvent.data.compactionId);
  assert.equal(summaryEvent.data.provider, "test-provider");
  assert.equal(summaryEvent.data.model, "test-compiler");
  assert.deepEqual(summaryEvent.data.shadowedSeqs, [1, 2, 3, 4]);
  assert.deepEqual(summaryEvent.data.shadowedRange, { start: 1, end: 4 });
  const checkpoint = events[result.summarySeq + 1];
  assert.equal(checkpoint.type, "user/message");
  assert.equal(checkpoint.data.source.plugin, "compact");
  assert.equal(checkpoint.data.source.compactionId, startEvent.data.compactionId);
  assert.deepEqual(session.surface.nodes, [checkpoint.seq, 5]);
});

test("compactSurfaceRegion rejects a checkpoint that does not shrink the surface", async () => {
  const session = makeIdleSession();
  const meter = makeFakeMeter();
  meter.estimateMessage = () => 500;
  await assert.rejects(
    () => compactSurfaceRegion({ meter, compile: fakeCompile }, session, 1, 4, undefined, { owner: null, stability: "selected-span" }, undefined),
    (error) => error instanceof ManualCompactionError && error.code === "summary"
  );
  // The failed manual attempt still closed its bracket with an error marker.
  const events = session.events;
  const last = events[events.length - 1];
  assert.equal(last.type, "compaction/end");
  assert.ok(last.data.error.length > 0);
  // Surface untouched.
  assert.deepEqual(session.surface.nodes, [1, 2, 3, 4, 5]);
});

test("compactSurfaceRegion reports busy on an unmatched compaction start", async () => {
  const session = makeIdleSession();
  session.append("compaction/start", { compactionId: "stale", turn: null });
  await assert.rejects(
    () => compactSurfaceRegion({ meter: makeFakeMeter(), compile: fakeCompile }, session, 1, 4, undefined, { owner: null, stability: "selected-span" }, undefined),
    (error) => error instanceof ManualCompactionError && error.code === "busy"
  );
});

test("compactSurfaceRegion reports busy for manual compaction inside an open turn", async () => {
  const session = makeIdleSession();
  session.append("turn/start", { turn: 2 });
  await assert.rejects(
    () => compactSurfaceRegion({ meter: makeFakeMeter(), compile: fakeCompile }, session, 1, 4, undefined, { owner: null, stability: "selected-span" }, undefined),
    (error) => error instanceof ManualCompactionError && error.code === "busy"
  );
});

test("compactSurfaceRegion reports changed when the surface moves during compilation", async () => {
  const session = makeIdleSession();
  const meter = makeFakeMeter();
  let calls = 0;
  const original = meter.measure;
  meter.measure = (target) => {
    calls += 1;
    const measured = original(target);
    if (calls > 1) measured.nodes = measured.nodes.map((node) => ({ ...node, tokens: 999 }));
    return measured;
  };
  await assert.rejects(
    () => compactSurfaceRegion({ meter, compile: fakeCompile }, session, 1, 4, undefined, { owner: null, stability: "selected-span" }, undefined),
    (error) => error instanceof ManualCompactionError && error.code === "changed"
  );
});

test("compactSurfaceRegion runs an automatic in-turn transaction", async () => {
  const session = makeIdleSession();
  session.append("turn/start", { turn: 2 });
  const result = await compactSurfaceRegion({ meter: makeFakeMeter(), compile: fakeCompile }, session, 1, 4, undefined, {
    owner: "current-turn",
    stability: "whole-surface"
  }, undefined);
  assert.deepEqual(result.shadowedSeqs, [1, 2, 3, 4]);
  assert.equal(session.events[result.startSeq].data.turn, 2);
});

test("SurfaceChangedError is exported for callers to distinguish", () => {
  assert.equal(new SurfaceChangedError("x") instanceof Error, true);
});

test("fenceCode wraps text and adapts to embedded fences", () => {
  assert.equal(fenceCode("a\nb"), "```\na\nb\n```");
  // A 3-backtick run inside forces a longer fence; content bytes untouched.
  assert.equal(fenceCode("x\n```\ncode\n```\ny"), "````\nx\n```\ncode\n```\ny\n````");
  // Longer runs escalate further.
  assert.equal(fenceCode("````"), "`````\n````\n`````");
  assert.equal(fenceCode(""), "```\n\n```");
  assert.equal(fenceCode("no backticks"), "```\nno backticks\n```");
});

import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isReplayEnvelope, type EnvelopeLike } from "../src/lib/sentry-replay.ts";

// `isReplayEnvelope` decides whether a Sentry envelope skips the Tauri IPC
// transport. This is load-bearing: Houston routes every envelope through the
// Rust SDK, whose parser rejects `replay_event` / `replay_recording` items and
// silently drops the whole envelope. A false negative here means Session
// Replay never reaches Sentry; a false positive sends ordinary errors over the
// wrong (direct HTTP) path. Pin the routing decision down.

const header = { event_id: "9c2a1f", sent_at: "2026-06-01T00:00:00.000Z" };

function envelope(...types: string[]): EnvelopeLike {
  return [header, types.map((type) => [{ type }, {}] as const)];
}

describe("isReplayEnvelope", () => {
  it("routes a replay_recording envelope off IPC", () => {
    strictEqual(isReplayEnvelope(envelope("replay_event", "replay_recording")), true);
  });

  it("matches a replay_event item on its own", () => {
    strictEqual(isReplayEnvelope(envelope("replay_event")), true);
  });

  it("matches a replay_recording item on its own", () => {
    strictEqual(isReplayEnvelope(envelope("replay_recording")), true);
  });

  it("keeps ordinary error events on the IPC path", () => {
    strictEqual(isReplayEnvelope(envelope("event")), false);
  });

  it("keeps transactions on the IPC path", () => {
    strictEqual(isReplayEnvelope(envelope("transaction")), false);
  });

  it("keeps session updates on the IPC path", () => {
    strictEqual(isReplayEnvelope(envelope("session")), false);
  });

  it("treats an empty-item envelope as non-replay", () => {
    strictEqual(isReplayEnvelope(envelope()), false);
  });

  it("routes a mixed envelope off IPC if any item is replay", () => {
    strictEqual(isReplayEnvelope(envelope("event", "replay_recording")), true);
  });

  it("ignores items whose header has no type", () => {
    strictEqual(isReplayEnvelope([header, [[{}, {}]]]), false);
  });
});

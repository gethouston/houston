import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  createWakingStuckTracker,
  WAKING_EPISODE_GAP_MS,
  WAKING_STUCK_THRESHOLD_MS,
} from "../src/lib/waking-stuck-tracker.ts";

// PRODUCT-1640: an agent answering nothing but waking past the gateway's own
// 300s ensure-awake hold is a crashlooping or unscheduled pod — one
// error-level Sentry event per episode, carrying the first and last raw
// bodies. Everything short of that stays a warning in the fixed
// `engine_waking` issue.

const MIN = 60_000;
const first = '{"error":"engine unavailable","detail":"agent is waking"}';
const last =
  '{"error":"engine proxy failed","detail":"dial tcp: lookup agent-abc.svc.cluster.local: no such host"}';

describe("createWakingStuckTracker", () => {
  it("stays quiet below the threshold", () => {
    const t = createWakingStuckTracker();
    strictEqual(t.noteWaking("a", first, 0), null);
    strictEqual(t.noteWaking("a", first, MIN), null);
    strictEqual(t.noteWaking("a", first, WAKING_STUCK_THRESHOLD_MS - 1), null);
  });

  it("escalates ONCE at the threshold with the first and last bodies", () => {
    const t = createWakingStuckTracker();
    t.noteWaking("a", first, 0);
    t.noteWaking("a", "middle", MIN);
    t.noteWaking("a", "middle", 2 * MIN);
    t.noteWaking("a", "middle", 3 * MIN);
    t.noteWaking("a", "middle", 4 * MIN);
    deepStrictEqual(t.noteWaking("a", last, WAKING_STUCK_THRESHOLD_MS), {
      agentKey: "a",
      firstBody: first,
      lastBody: last,
      sinceMs: WAKING_STUCK_THRESHOLD_MS,
      answers: 6,
    });
    strictEqual(
      t.noteWaking("a", last, WAKING_STUCK_THRESHOLD_MS + MIN),
      null,
      "the same episode never escalates twice",
    );
  });

  it("keeps agents independent", () => {
    const t = createWakingStuckTracker();
    for (let at = 0; at < WAKING_STUCK_THRESHOLD_MS; at += MIN) {
      t.noteWaking("a", first, at);
      if (at >= MIN) t.noteWaking("b", first, at);
    }
    strictEqual(
      t.noteWaking("b", last, WAKING_STUCK_THRESHOLD_MS),
      null,
      "b only started answering at 1min",
    );
    strictEqual(
      t.noteWaking("a", last, WAKING_STUCK_THRESHOLD_MS)?.agentKey,
      "a",
    );
  });

  it("a success ends the episode", () => {
    const t = createWakingStuckTracker();
    for (let at = 0; at <= 4 * MIN; at += MIN) t.noteWaking("a", first, at);
    t.noteSuccess("a");
    // Answers resume right away: the count restarts from here.
    const restart = 4 * MIN + 1;
    for (
      let at = restart;
      at < restart + WAKING_STUCK_THRESHOLD_MS;
      at += MIN
    ) {
      strictEqual(t.noteWaking("a", first, at), null);
    }
    const stuck = t.noteWaking("a", last, restart + WAKING_STUCK_THRESHOLD_MS);
    strictEqual(stuck?.sinceMs, WAKING_STUCK_THRESHOLD_MS);
    strictEqual(stuck?.answers, 6);
  });

  it("a silence longer than the gap starts a new episode", () => {
    const t = createWakingStuckTracker();
    t.noteWaking("a", first, 0);
    const resumed = WAKING_EPISODE_GAP_MS + 1;
    for (
      let at = resumed;
      at < resumed + WAKING_STUCK_THRESHOLD_MS;
      at += MIN
    ) {
      strictEqual(
        t.noteWaking("a", first, at),
        null,
        "the pre-gap answer must not count toward the new episode",
      );
    }
    strictEqual(
      t.noteWaking("a", last, resumed + WAKING_STUCK_THRESHOLD_MS)?.sinceMs,
      WAKING_STUCK_THRESHOLD_MS,
    );
  });

  it("a silence exactly at the gap still continues the episode", () => {
    const t = createWakingStuckTracker({ thresholdMs: 2 * MIN, gapMs: MIN });
    t.noteWaking("a", first, 0);
    t.noteWaking("a", first, MIN);
    strictEqual(t.noteWaking("a", last, 2 * MIN)?.answers, 3);
  });
});

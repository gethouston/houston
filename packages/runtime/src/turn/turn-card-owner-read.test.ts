import { afterEach, expect, test, vi } from "vitest";
import {
  AGENT,
  closeTurnServers,
  OTHER,
  OWNER,
  pooledTurn,
} from "./turn-interaction-owner.test-support";

afterEach(closeTurnServers);

function terminalTimings(text: string): Record<string, number> {
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const frame = JSON.parse(line.slice("data:".length)) as {
      type?: string;
      data?: { timingsMs?: Record<string, number> } | null;
    };
    if (frame.data?.timingsMs) return frame.data.timingsMs;
  }
  throw new Error(`no terminal frame with timings in: ${text}`);
}

test("a conversation hydrated from the store under the claim is not read again", async () => {
  const out = await pooledTurn(
    "c1",
    { actingAs: { userId: OWNER } },
    undefined,
    { currentPrefetch: true, conversationNotInlined: true },
  );

  expect(out.res.status).toBe(200);
  expect(out.reads).toEqual({ full: 1, notModified: 0 });
  expect(out.order).not.toContain("conversation-reread");
  expect(out.runTurn).toHaveBeenCalledOnce();
});

test("another member is still refused when the live-read conversation carries a card", async () => {
  const out = await pooledTurn(
    "c1",
    { actingAs: { userId: OTHER } },
    undefined,
    { currentPrefetch: true, conversationNotInlined: true },
  );

  expect(out.res.status).toBe(403);
  expect(JSON.parse(out.text)).toEqual({
    error: "not_interaction_owner",
    code: "not_interaction_owner",
  });
  expect(out.reads).toEqual({ full: 1, notModified: 0 });
  expect(out.runTurn).not.toHaveBeenCalled();
  expect(out.turnlog).toEqual([]);
  expect(out.pool.writes).toEqual([]);
});

test("a conversation missing from the prefetched listing is still read under the claim", async () => {
  const out = await pooledTurn(
    "fresh",
    { actingAs: { userId: OTHER } },
    undefined,
    { prefetchBeforeConversation: true },
  );

  expect(out.res.status).toBe(403);
  expect(out.reads).toEqual({ full: 1, notModified: 0 });
});

test("an inlined conversation is re-read beside hydration, not after it", async () => {
  const held = `${AGENT}/.houston/activity/activity.json`;
  const out = await pooledTurn(
    "c1",
    { actingAs: { userId: OWNER } },
    undefined,
    { stalePrefetch: true, storeGeneration: "2", holdLive: held },
  );

  expect(out.res.status).toBe(200);
  expect(out.reads).toEqual({ full: 1, notModified: 0 });
  expect(out.order).toEqual(["conversation-reread", "held-read-answered"]);
});

test("another member is still refused on a stale inlined conversation", async () => {
  const out = await pooledTurn(
    "c1",
    { actingAs: { userId: OTHER } },
    undefined,
    {
      stalePrefetch: true,
      storeGeneration: "2",
      holdLive: `${AGENT}/.houston/activity/activity.json`,
    },
  );

  expect(out.res.status).toBe(403);
  expect(JSON.parse(out.text)).toMatchObject({ code: "not_interaction_owner" });
  expect(out.runTurn).not.toHaveBeenCalled();
});

test("the terminal frame times the card check after hydration", async () => {
  const out = await pooledTurn(
    "c1",
    { actingAs: { userId: OWNER } },
    undefined,
    { stalePrefetch: true, storeGeneration: "2" },
  );

  const timings = terminalTimings(out.text);
  expect(timings.card_read).toBeTypeOf("number");
  expect(timings.card_checked).toBeGreaterThanOrEqual(timings.hydrated ?? 0);
  expect(timings.card_checked).toBeLessThanOrEqual(timings.sse_open ?? 0);
});

test("a turn with no card to judge still reports the step", async () => {
  const out = await pooledTurn("c1", {});

  const timings = terminalTimings(out.text);
  expect(timings.card_checked).toBeTypeOf("number");
  expect(timings.card_read).toBeUndefined();
});

test("a stale inlined listing with live-read bytes still refuses another member", async () => {
  const out = await pooledTurn(
    "c1",
    { actingAs: { userId: OTHER } },
    undefined,
    { stalePrefetch: true, conversationNotInlined: true },
  );

  expect(out.res.status).toBe(403);
  expect(out.reads).toEqual({ full: 1, notModified: 0 });
});

test("the read is conditioned on the inlined bytes' own generation", async () => {
  const out = await pooledTurn(
    "c1",
    { actingAs: { userId: OWNER } },
    undefined,
    { currentPrefetch: true, inlinedGeneration: "2", storeGeneration: "2" },
  );

  expect(out.res.status).toBe(200);
  expect(out.reads).toEqual({ full: 0, notModified: 1 });
});

test("a hydration failure is answered promptly while the card read hangs", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const started = performance.now();
    const out = await pooledTurn(
      "c1",
      { actingAs: { userId: OTHER } },
      undefined,
      {
        stalePrefetch: true,
        hangReread: true,
        failLive: `${AGENT}/.houston/activity/activity.json`,
      },
    );

    expect(out.order).toContain("conversation-reread");
    expect(out.res.status).toBe(500);
    expect(JSON.parse(out.text)).toMatchObject({
      error: expect.stringContaining("failed (403)"),
    });
    expect(out.runTurn).not.toHaveBeenCalled();
    expect(performance.now() - started).toBeLessThan(2000);
  } finally {
    errorLog.mockRestore();
  }
}, 5000);

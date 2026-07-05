/**
 * Transcript hydration contract: `turns/history` folds a conversation's
 * persisted messages into feed frames, and `turns/observe` SEEDS the
 * conversation VM's feed from that history FIRST — so a mobile client opening a
 * chat sees the full transcript immediately, with no double-render.
 */

import { type FakeHost, SEED_AGENT_ID } from "@houston/fake-host";
import type { ConversationVM, FeedFrame } from "@houston/sdk";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  cannedReply,
  convVm,
  type Harness,
  makeSdk,
  resetHost,
  startHost,
  until,
} from "./harness";

let host: FakeHost;

beforeAll(async () => {
  host = await startHost();
});
afterAll(async () => {
  await host.stop();
});

let h: Harness;
beforeEach(async () => {
  await resetHost(host.url);
  h = makeSdk(host.url);
});
afterEach(() => {
  h.sdk.dispose();
});

const seedUsage = { context_tokens: 1200, output_tokens: 80, cached_tokens: 0 };

/** Send a turn and wait for it to settle, so a transcript is persisted. */
async function seedOneTurn(cid: string, text: string): Promise<void> {
  await h.sdk.turns.send({ agentId: SEED_AGENT_ID, conversationId: cid, text });
  await until(() => convVm(h.sdk, cid)?.running === false, "turn settled");
}

describe("turns/history — fold persisted transcript", () => {
  it("folds a settled turn into user_message, assistant_text, final_result", async () => {
    const cid = "c-hist-fold";
    await seedOneTurn(cid, "Ping");

    const feed: FeedFrame[] = await h.sdk.turns.history(cid, SEED_AGENT_ID);
    expect(feed).toEqual([
      { feed_type: "user_message", data: "Ping", author: undefined },
      { feed_type: "assistant_text", data: cannedReply("Ping") },
      {
        feed_type: "final_result",
        data: {
          result: cannedReply("Ping"),
          cost_usd: null,
          duration_ms: null,
          usage: seedUsage,
        },
      },
    ]);
  });
});

describe("turns/observe — seed the VM feed from history", () => {
  it("opens a chat complete for a client that never sent the turn", async () => {
    const cid = "c-observe-seed";
    // One client sends + settles the turn (persists the transcript).
    await seedOneTurn(cid, "Ping");

    // A SECOND, fresh client (a mobile app opening the chat) has never streamed
    // this conversation. Observing must show the full transcript from history.
    const h2 = makeSdk(host.url);
    try {
      await h2.sdk.turns.observe(cid, SEED_AGENT_ID);
      await until(
        () =>
          convVm(h2.sdk, cid)?.feed.some(
            (f) => f.feed_type === "assistant_text",
          ) === true,
        "seeded transcript visible on the fresh client",
      );

      const vm = convVm(h2.sdk, cid) as ConversationVM;
      // Exactly the folded transcript — no duplication from the idle observer.
      expect(vm.feed.map((f) => f.feed_type)).toEqual([
        "user_message",
        "assistant_text",
        "final_result",
      ]);
      expect(vm.feed.find((f) => f.feed_type === "assistant_text")?.data).toBe(
        cannedReply("Ping"),
      );
      // Stable, unique feed ids assigned by the seed.
      expect(new Set(vm.feed.map((f) => f.id)).size).toBe(vm.feed.length);
    } finally {
      h2.sdk.dispose();
    }
  });

  it("seeds the user bubble the live send omitted when re-observing idle", async () => {
    const cid = "c-observe-reseed";
    await seedOneTurn(cid, "Ping");
    // The live send path never renders the user's own echo, so its settled feed
    // has no user_message. Re-observing the now-idle conversation seeds the full
    // transcript from history, so the user's bubble appears — without doubling
    // the assistant reply.
    expect(convVm(h.sdk, cid)?.feed.map((f) => f.feed_type)).toEqual([
      "assistant_text",
      "final_result",
    ]);
    await h.sdk.turns.observe(cid, SEED_AGENT_ID);
    await until(
      () => convVm(h.sdk, cid)?.feed[0]?.feed_type === "user_message",
      "re-seeded transcript leads with the user bubble",
    );
    expect(convVm(h.sdk, cid)?.feed.map((f) => f.feed_type)).toEqual([
      "user_message",
      "assistant_text",
      "final_result",
    ]);
  });
});

/**
 * Turn streaming contract: sending a message drives the `conversation/<id>`
 * view-model — streaming assistant text grows IN PLACE (one feed entry, stable
 * id, cumulative text), the turn settles exactly once on the terminal frame,
 * and a cancel settles cleanly.
 *
 * The settled `ConversationVM` is the cross-platform feed snapshot a native
 * shell renders, so its exact JSON is pinned here as API.
 */

import { type FakeHost, SEED_AGENT_ID } from "@houston/fake-host";
import { HoustonEngineClient } from "@houston/runtime-client";
import { type ConversationVM, conversationScope } from "@houston/sdk";
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
  control,
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

describe("turn send → stream → settle", () => {
  it("settles a completed turn into a pinned conversation VM", async () => {
    const cid = "c-pin";
    await h.sdk.turns.send({
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });

    await until(
      () => convVm(h.sdk, cid)?.running === false,
      "turn settled (running=false)",
    );

    const vm = convVm(h.sdk, cid);
    // Every feed entry now carries a stamped epoch-ms `ts`; assert it is present
    // and numeric, then compare the rest of the VM structurally (ts stripped).
    for (const f of vm?.feed ?? []) expect(typeof f.ts).toBe("number");
    expect({
      ...vm,
      feed: (vm?.feed ?? []).map(({ ts, ...rest }) => rest),
    }).toEqual({
      running: false,
      sessionStatus: "completed",
      // The persisted board status now rides the VM (the handled-vs-error
      // signal a native shell reads); a clean turn with nothing outstanding
      // lands on `done` (needs_you is for a turn that ended asking the user).
      boardStatus: "done",
      // No pending interaction — the canned turn ended asking nothing.
      pendingInteraction: null,
      feed: [
        // The optimistic push — the ONE user bubble (its echo never renders).
        { id: "f0", feed_type: "user_message", data: "Ping" },
        { id: "f1", feed_type: "assistant_text", data: cannedReply("Ping") },
        {
          id: "f2",
          feed_type: "final_result",
          data: {
            result: cannedReply("Ping"),
            cost_usd: null,
            duration_ms: null,
            usage: seedUsage,
          },
        },
      ],
    } satisfies ConversationVM);
  });

  it("grows streaming text in ONE feed entry with a stable id", async () => {
    const cid = "c-stream";
    // Slow the per-delta cadence so intermediate snapshots are observable.
    await control(host.url, "chat-config", { replyDelayMs: 40 });

    const streamingSnaps: ConversationVM[] = [];
    const off = h.sdk.subscribe(conversationScope(SEED_AGENT_ID, cid), (s) =>
      streamingSnaps.push(structuredClone(s as ConversationVM)),
    );

    await h.sdk.turns.send({
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });
    await until(() => convVm(h.sdk, cid)?.running === false, "turn settled");
    off();

    // The streaming entries: every mid-flight snapshot that carried an
    // assistant_text_streaming feed item.
    const streamingEntries = streamingSnaps
      .map((s) =>
        s.feed.find((f) => f.feed_type === "assistant_text_streaming"),
      )
      .filter((f): f is NonNullable<typeof f> => f !== undefined);

    expect(streamingEntries.length).toBeGreaterThan(1); // multiple deltas seen
    // One stable id across the whole stream — the reply is one bubble.
    // (f0 is the optimistic user bubble; the reply streams into f1.)
    const ids = new Set(streamingEntries.map((f) => f.id));
    expect(ids).toEqual(new Set(["f1"]));
    // Cumulative, monotonic growth — never a shrink, never a reset.
    const lengths = streamingEntries.map((f) => String(f.data).length);
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1]);
    }
    // The final entry keeps the SAME id, finalized to assistant_text.
    const finalTextEntry = convVm(h.sdk, cid)?.feed.find(
      (f) => f.feed_type === "assistant_text",
    );
    expect(finalTextEntry?.id).toBe("f1");
    expect(finalTextEntry?.data).toBe(cannedReply("Ping"));
  });

  it("marks the conversation running while the turn is in flight", async () => {
    const cid = "c-running";
    await control(host.url, "chat-config", { replyDelayMs: 40 });
    await h.sdk.turns.send({
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });
    await until(
      () => convVm(h.sdk, cid)?.running === true,
      "turn observed running",
    );
    expect(convVm(h.sdk, cid)?.sessionStatus).toBe("running");

    await until(() => convVm(h.sdk, cid)?.running === false, "then settled");
  });

  it("persists the turn to history stamped with a shared turnId", async () => {
    const cid = "c-history";
    await h.sdk.turns.send({
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });
    await until(() => convVm(h.sdk, cid)?.running === false, "settled");

    const engine = new HoustonEngineClient({
      baseUrl: `${host.url}/agents/${SEED_AGENT_ID}`,
      fetch,
    });
    const { messages } = await engine.getHistory(cid);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1].content).toBe(cannedReply("Ping"));
    // Both messages of a turn share its id (the resync-by-turnId contract).
    expect(messages[0].turnId).toBeTruthy();
    expect(messages[1].turnId).toBe(messages[0].turnId);
  });
});

describe("turn cancel", () => {
  it("settles a cancelled turn with the Stopped-by-user surface", async () => {
    const cid = "c-cancel";
    await control(host.url, "chat-config", { replyDelayMs: 80 });
    await h.sdk.turns.send({
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });
    // Wait for a streamed delta: proof the turn is genuinely in flight on the
    // server (so cancel hits a live turn, not a not-yet-started one).
    await until(
      () =>
        convVm(h.sdk, cid)?.feed.some(
          (f) => f.feed_type === "assistant_text_streaming",
        ) === true,
      "turn streaming before cancel",
    );

    await h.sdk.turns.cancel(cid, SEED_AGENT_ID);
    await until(
      () => convVm(h.sdk, cid)?.running === false,
      "turn settled after cancel",
    );

    const vm = convVm(h.sdk, cid);
    expect(vm?.running).toBe(false);
    // A user Stop is a handled state, not the red error card. sessionStatus is
    // "error" (clears the loading flag) but the board lands on needs_you — the
    // signal a native shell must read to avoid rendering a normal Stop red.
    expect(vm?.sessionStatus).toBe("error");
    expect(vm?.boardStatus).toBe("needs_you");
    const stop = vm?.feed.find(
      (f) =>
        f.feed_type === "system_message" &&
        String(f.data).includes("Stopped by user"),
    );
    expect(stop).toBeDefined();
  });
});

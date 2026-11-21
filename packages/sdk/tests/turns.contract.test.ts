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
  sleep,
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
    for (const f of vm?.feed ?? []) expect(typeof f.ts).toBe("number");
    expect({
      ...vm,
      feed: (vm?.feed ?? []).map(({ ts, ...rest }) => rest),
    }).toEqual({
      running: false,
      sessionStatus: "completed",
      boardStatus: "needs_you",
      pendingInteraction: null,
      feed: [
        {
          id: "f0",
          feed_type: "user_message",
          data: "Ping",
          turnId: expect.any(String) as unknown as string,
        },
        {
          id: "f1",
          feed_type: "assistant_text",
          data: cannedReply("Ping"),
          turnId: expect.any(String) as unknown as string,
        },
        {
          id: "f2",
          feed_type: "final_result",
          data: {
            result: cannedReply("Ping"),
            cost_usd: null,
            duration_ms: null,
            usage: seedUsage,
          },
          turnId: expect.any(String) as unknown as string,
        },
      ],
    } satisfies ConversationVM);
  });

  it("grows streaming text in ONE feed entry with a stable id", async () => {
    const cid = "c-stream";
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

    const streamingEntries = streamingSnaps
      .map((s) =>
        s.feed.find((f) => f.feed_type === "assistant_text_streaming"),
      )
      .filter((f): f is NonNullable<typeof f> => f !== undefined);

    expect(streamingEntries.length).toBeGreaterThan(1);
    const ids = new Set(streamingEntries.map((f) => f.id));
    expect(ids).toEqual(new Set(["f1"]));
    const lengths = streamingEntries.map((f) => String(f.data).length);
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1]);
    }
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
    expect(messages[0].turnId).toBeTruthy();
    expect(messages[1].turnId).toBe(messages[0].turnId);
  });
});

describe("multi-client conversation reactivity", () => {
  it("reloads an open idle chat when another client completes a turn", async () => {
    const cid = "c-other-client";
    const receiver = makeSdk(host.url);
    const scope = conversationScope(SEED_AGENT_ID, cid);
    const off = receiver.sdk.subscribe(scope, () => {});
    try {
      await receiver.sdk.turns.observe(cid, SEED_AGENT_ID);
      await sleep(100);

      await h.sdk.turns.send({
        agentId: SEED_AGENT_ID,
        conversationId: cid,
        text: "From the other client",
      });

      await until(
        () =>
          convVm(receiver.sdk, cid)?.feed.some(
            (item) =>
              item.feed_type === "assistant_text" &&
              item.data === cannedReply("From the other client"),
          ) === true,
        "receiver reloaded the other client's completed turn",
      );
      expect(
        convVm(receiver.sdk, cid)?.feed.some(
          (item) =>
            item.feed_type === "user_message" &&
            item.data === "From the other client",
        ),
      ).toBe(true);
    } finally {
      off();
      receiver.sdk.dispose();
    }
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

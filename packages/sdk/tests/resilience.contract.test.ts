import { type FakeHost, SEED_AGENT_ID } from "@houston/fake-host";
import { HoustonEngineClient } from "@houston/runtime-client";
import {
  type ConversationVM,
  observeConversation,
  StreamRegistry,
  TURN_DIED_MESSAGE,
} from "@houston/sdk";
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
  RecordingFeedOutput,
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

const streamingStarted = (cid: string): boolean =>
  convVm(h.sdk, cid)?.feed.some(
    (f) => f.feed_type === "assistant_text_streaming",
  ) === true;

const assistantEntries = (cid: string) =>
  (convVm(h.sdk, cid)?.feed ?? []).filter(
    (f) => f.feed_type === "assistant_text",
  );

describe("reconnect mid-turn (network drop)", () => {
  it("replays the gap — no truncation, no duplication", async () => {
    const cid = "c-drop";
    await control(host.url, "chat-config", { replyDelayMs: 50 });
    await h.sdk.turns.send({
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });
    await until(() => streamingStarted(cid), "streaming began");

    const dropped = (await control(host.url, "drop-chat-streams")) as {
      dropped: number;
    };
    expect(dropped.dropped).toBeGreaterThan(0);

    await until(
      () => convVm(h.sdk, cid)?.running === false,
      "turn settled after reconnect",
    );

    const vm = convVm(h.sdk, cid);
    expect(vm?.sessionStatus).toBe("completed");
    expect(assistantEntries(cid)).toHaveLength(1);
    expect(assistantEntries(cid)[0].data).toBe(cannedReply("Ping"));
  });
});

describe("turn-boundary resync", () => {
  it("settles OUR turn from history when a new turn owns the stream", async () => {
    const cid = "c-boundary";
    await control(host.url, "chat-config", { replyDelayMs: 50 });
    await h.sdk.turns.send({
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });
    await until(() => streamingStarted(cid), "our turn adopted + streaming");

    const advanced = (await control(host.url, "turn-boundary", {
      nextText: "A different turn",
    })) as { advanced: number };
    expect(advanced.advanced).toBe(1);

    await until(
      () => convVm(h.sdk, cid)?.running === false,
      "our turn settled across the boundary",
    );

    const vm = convVm(h.sdk, cid);
    expect(vm?.sessionStatus).toBe("completed");
    expect(assistantEntries(cid)).toHaveLength(1);
    expect(assistantEntries(cid)[0].data).toBe(cannedReply("Ping"));
  });
});

describe("observer attach on a running turn", () => {
  it("surfaces the in-flight turn and settles it like a sent one", async () => {
    const cid = "c-observe";
    await control(host.url, "chat-config", { replyDelayMs: 120 });

    const engine = new HoustonEngineClient({
      baseUrl: `${host.url}/agents/${SEED_AGENT_ID}`,
      fetch,
    });
    await engine.sendMessage(cid, "Ping");
    let history = await engine.getHistory(cid);
    while (history.messages.length === 0) {
      await sleep(10);
      history = await engine.getHistory(cid);
    }

    const out = new RecordingFeedOutput();
    observeConversation(
      engine,
      SEED_AGENT_ID,
      cid,
      out,
      history.messages.length,
      new StreamRegistry(),
    );

    await until(
      () => out.statuses.includes("completed"),
      "observed turn settled completed",
    );

    expect(out.statuses).toContain("running");
    expect(out.statuses).toContain("completed");
    const finalText = out.feed.find((f) => f.feed_type === "assistant_text");
    expect(finalText?.data).toBe(cannedReply("Ping"));
    expect(out.board).toContain("needs_you");
  });

  it("sdk.turns.observe surfaces a turn started elsewhere into the VM", async () => {
    const cid = "c-observe-facade";
    await control(host.url, "chat-config", { replyDelayMs: 120 });

    const engine = new HoustonEngineClient({
      baseUrl: `${host.url}/agents/${SEED_AGENT_ID}`,
      fetch,
    });
    await engine.sendMessage(cid, "Ping");
    let history = await engine.getHistory(cid);
    while (history.messages.length === 0) {
      await sleep(10);
      history = await engine.getHistory(cid);
    }

    await h.sdk.turns.observe(cid, SEED_AGENT_ID);
    await until(
      () => convVm(h.sdk, cid)?.running === true,
      "observed running surfaced in VM",
    );
    await until(
      () => convVm(h.sdk, cid)?.sessionStatus === "completed",
      "observed turn settled in VM",
    );

    const vm = convVm(h.sdk, cid);
    expect(vm?.boardStatus).toBe("needs_you");
    expect(vm?.feed.some((f) => f.data === cannedReply("Ping"))).toBe(true);
  });

  it("sdk.turns.observe on an idle conversation ends in a coherent idle VM", async () => {
    const cid = "c-observe-idle";
    await h.sdk.turns.observe(cid, SEED_AGENT_ID);
    await sleep(200);
    const vm = convVm(h.sdk, cid);
    expect(vm?.running ?? false).toBe(false);
  });

  it("closes immediately on an idle conversation (no running turn)", async () => {
    const cid = "c-idle";
    const engine = new HoustonEngineClient({
      baseUrl: `${host.url}/agents/${SEED_AGENT_ID}`,
      fetch,
    });
    const out = new RecordingFeedOutput();
    observeConversation(
      engine,
      SEED_AGENT_ID,
      cid,
      out,
      0,
      new StreamRegistry(),
    );
    await sleep(200);
    expect(out.statuses).toEqual([]);
    expect(out.feed).toEqual([]);
  });
});

describe("dead-turn kill (host reaper)", () => {
  it("settles as an error with the dead-turn copy", async () => {
    const cid = "c-kill";
    await control(host.url, "chat-config", { replyDelayMs: 60 });
    await h.sdk.turns.send({
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });
    await until(() => streamingStarted(cid), "streaming began");

    const killed = (await control(host.url, "kill-turn")) as { killed: number };
    expect(killed.killed).toBe(1);

    await until(
      () => convVm(h.sdk, cid)?.running === false,
      "dead turn settled",
    );

    const vm = convVm(h.sdk, cid) as ConversationVM;
    expect(vm.sessionStatus).toBe("error");
    expect(
      vm.feed.some(
        (f) => f.feed_type === "system_message" && f.data === TURN_DIED_MESSAGE,
      ),
    ).toBe(true);
  });
});

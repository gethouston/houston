/**
 * Resilience contract: what the resumable turn machinery guarantees across a
 * mid-turn network drop, a turn-boundary resync, an observer attach on a
 * running turn, and a dead-turn kill — all driven by the fake host's real
 * `POST /__test__/*` control plane against the shared streaming pieces.
 *
 * The load-bearing invariant: a transport blip NEVER truncates or duplicates a
 * turn, and a turn always settles exactly once with the RIGHT reply.
 */

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

/** True once at least one streaming assistant delta has folded into the VM. */
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

    // Sever every open chat stream WITHOUT ending the turns: the turn keeps
    // producing into the replay log; the SDK reconnects with ?after=<seq>.
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
    // Exactly ONE assistant bubble, carrying the FULL reply (no lost tail, no
    // re-appended duplicate from replayed frames).
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
    // Wait for a streaming delta so OUR turnId is adopted (from the user echo)
    // before the boundary lands.
    await until(() => streamingStarted(cid), "our turn adopted + streaming");

    // End our turn while nobody watches, then start a DIFFERENT turn: the
    // reconnecting cursor lands outside the cleared window and resyncs onto the
    // new turnId — our turn must settle from persisted history, by our turnId.
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
    // Settled from history, by our turnId — our full reply, exactly once, never
    // the other turn's text.
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
    // Another writer starts the turn (no SDK stream registered for it).
    await engine.sendMessage(cid, "Ping");
    // The user message persists at turn START, so its presence proves the turn
    // is now running before we attach the observer.
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

    // The observer surfaced the running turn, then settled it to completion.
    expect(out.statuses).toContain("running");
    expect(out.statuses).toContain("completed");
    const finalText = out.feed.find((f) => f.feed_type === "assistant_text");
    expect(finalText?.data).toBe(cannedReply("Ping"));
    expect(out.board).toContain("needs_you");
  });

  it("sdk.turns.observe surfaces a turn started elsewhere into the VM", async () => {
    const cid = "c-observe-facade";
    await control(host.url, "chat-config", { replyDelayMs: 120 });

    // Another writer (a bare engine client) starts the turn — no SDK stream.
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

    // The mobile-v1 hole this closes: open the conversation through the SDK
    // facade and see the in-flight turn.
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
    // The idle sync closes the observer with no push; the VM never flips to
    // running (it either stays absent or idle — never a stuck spinner).
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
    // Nothing to render: the idle sync closes the stream with no push.
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

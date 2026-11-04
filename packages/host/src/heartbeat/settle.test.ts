import type { ChatMessage } from "@houston/protocol";
import { describe, expect, test, vi } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import type { RuntimeChannel } from "../ports";
import { MemoryTurnBus } from "../turn/bus";
import {
  briefingOutcome,
  readBriefingTurn,
  settlePendingBriefing,
} from "./settle";

const NONCE = "heartbeat-1";
const SINCE = 1_000;
const prompt = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  role: "user",
  content: "hidden",
  ts: SINCE + 5,
  turnId: "t1",
  nonce: NONCE,
  ...over,
});
const reply = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  role: "assistant",
  content: "Good morning",
  ts: SINCE + 9,
  turnId: "t1",
  ...over,
});

describe("the briefing turn's outcome", () => {
  test("completed only with words and no failure marker", () => {
    expect(briefingOutcome([prompt(), reply()].slice(1))).toEqual({
      kind: "completed",
    });
  });

  test.each([
    [
      {
        providerError: {
          kind: "unknown",
          provider: "x",
          raw_excerpt: "overloaded",
        },
      },
      "overloaded",
    ],
    [{ stopped: true }, "the briefing turn was stopped"],
    [
      { interrupted: { cause: "engine_restart" } },
      "the briefing turn was interrupted",
    ],
    [{ content: "  " }, "the briefing turn ended without a reply"],
  ] as const)("failed on %j", (marker, reason) => {
    const turn = [reply({ content: "", ...marker } as Partial<ChatMessage>)];
    expect(briefingOutcome(turn)).toEqual({ kind: "failed", reason });
  });

  test("a summary from compacting is not a briefing", () => {
    const summary = reply({
      content: "You are the assistant. The workspace is /x.",
      compaction: { trigger: "proactive", pre_tokens: 200_000 },
      compactionSummary: true,
    });
    expect(briefingOutcome([summary, reply({ content: "" })])).toEqual({
      kind: "failed",
      reason: "the briefing turn ended without a reply",
    });
  });

  test("a turn nowhere to be found never reached the chat", () => {
    expect(briefingOutcome(null)).toEqual({
      kind: "failed",
      reason: "the briefing never reached the chat",
    });
  });
});

describe("finding the briefing turn", () => {
  const files = (entries: Record<string, unknown>) => async (key: string) =>
    key in entries ? JSON.stringify(entries[key]) : null;

  test("by its nonce, and only its own turn's replies", async () => {
    const read = files({
      "c/assistant.json": {
        messages: [
          prompt({ nonce: "other", turnId: "t0" }),
          reply({ turnId: "t0", content: "old" }),
          prompt(),
          reply(),
          { role: "user", content: "thanks", ts: SINCE + 20, turnId: "t2" },
          reply({ turnId: "t2", content: "you're welcome" }),
        ],
      },
    });
    const turn = await readBriefingTurn(read, "c/assistant.json", NONCE, SINCE);
    expect(turn?.map((m) => m.content)).toEqual(["Good morning"]);
  });

  test("in the archive once a later turn rotated it out of the live file", async () => {
    const read = files({
      "c/assistant.json": {
        messages: [
          { role: "user", content: "later", ts: SINCE + 99, turnId: "t9" },
        ],
        archived: { messages: 4, segments: [2, 2] },
      },
      "c/assistant.archive/2.json": { messages: [prompt(), reply()] },
      "c/assistant.archive/1.json": { messages: [] },
    });
    const turn = await readBriefingTurn(read, "c/assistant.json", NONCE, SINCE);
    expect(briefingOutcome(turn)).toEqual({ kind: "completed" });
  });

  test("stops at a segment older than the briefing", async () => {
    const read = vi.fn(
      files({
        "c/assistant.json": { messages: [], archived: { segments: [1, 1] } },
        "c/assistant.archive/2.json": {
          messages: [reply({ ts: SINCE - 10, turnId: "t0" })],
        },
      }),
    );
    expect(
      await readBriefingTurn(read, "c/assistant.json", NONCE, SINCE),
    ).toBeNull();
    expect(read).not.toHaveBeenCalledWith("c/assistant.archive/1.json");
  });
});

describe("settling", () => {
  test("never reads the transcript while the manager is busy", async () => {
    const vfs = { readText: vi.fn(async () => null) };
    const doc = {
      enabled: true,
      time: "08:00",
      last: null,
      seen: [],
      pending: { nonce: NONCE, at: new Date(SINCE).toISOString(), seen: ["k"] },
    };
    const ws = { id: "P", ownerUserId: "u" } as Workspace;
    const out = await settlePendingBriefing(
      {
        vfs: vfs as never,
        paths: { dataRoot: () => "root" } as never,
        channel: { busy: async () => true } as unknown as RuntimeChannel,
        lock: new MemoryTurnBus(),
      },
      ws,
      { workspace: ws, agent: { id: "P/.assistant" } as Agent },
      doc,
      new Date(),
    );
    expect(out).toBe(doc);
    expect(vfs.readText).not.toHaveBeenCalled();
  });
});

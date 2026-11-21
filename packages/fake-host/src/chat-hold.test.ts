import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEED_AGENT_ID } from "./config";
import { type FakeHost, startFakeHost } from "./server";

const JSON_HEADERS = { "content-type": "application/json" };

describe("chat-config holdAfterFirstDelta", () => {
  let host: FakeHost;
  const post = (path: string, body?: unknown) =>
    fetch(`${host.url}${path}`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const convo = (cid: string) =>
    `/agents/${SEED_AGENT_ID}/conversations/${cid}`;
  const history = async (cid: string) =>
    (
      (await (await fetch(`${host.url}${convo(cid)}/messages`)).json()) as {
        messages: Array<{ role: string; content: string }>;
      }
    ).messages;
  const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const firstSync = async (cid: string) => {
    const abort = new AbortController();
    try {
      const res = await fetch(`${host.url}${convo(cid)}/events`, {
        signal: abort.signal,
      });
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) throw new Error("stream ended before a sync frame");
        buffer += decoder.decode(value, { stream: true });
        const line = buffer
          .split("\n")
          .find((l) => l.startsWith("data: ") && l.includes('"sync"'));
        if (line)
          return JSON.parse(line.slice(6)).data as {
            running: boolean;
            partial: string;
            turnId?: string;
          };
      }
    } finally {
      abort.abort();
    }
  };

  beforeEach(async () => {
    host = await startFakeHost(0);
    await post("/__test__/reset");
  });
  afterEach(async () => {
    await host.stop();
  });

  it("keeps the turn running until a kill, which then finds it", async () => {
    await post("/__test__/chat-config", {
      replyDelayMs: 5,
      holdAfterFirstDelta: true,
    });
    await post(`${convo("hold-kill")}/messages`, { text: "hold me" });
    await settle(300);
    const res = await post("/__test__/kill-turn");
    expect(((await res.json()) as { killed: number }).killed).toBe(1);
  });

  it("a stream that attaches mid-turn gets the turn the 202 named, with its first delta", async () => {
    await post("/__test__/chat-config", {
      replyDelayMs: 5,
      holdAfterFirstDelta: true,
    });
    const sent = await post(`${convo("hold-late")}/messages`, {
      text: "hold me",
    });
    const accepted = (await sent.json()) as { ok: boolean; turnId?: string };
    expect(sent.status).toBe(202);
    expect(accepted.turnId).toEqual(expect.any(String));
    await settle(100);

    const sync = await firstSync("hold-late");
    expect(sync).toMatchObject({ running: true, turnId: accepted.turnId });
    expect(sync.partial).toMatch(/^Roger that/);
    await post("/__test__/kill-turn");
  });

  it("a drop releases the held turn, which then finishes into history", async () => {
    await post("/__test__/chat-config", {
      replyDelayMs: 5,
      holdAfterFirstDelta: true,
    });
    await post(`${convo("hold-drop")}/messages`, { text: "hold me" });
    await settle(300);
    expect(
      (await history("hold-drop")).some((m) => m.role === "assistant"),
    ).toBe(false);
    await post("/__test__/drop-chat-streams");
    await settle(300);
    const reply = (await history("hold-drop")).find(
      (m) => m.role === "assistant",
    );
    expect(reply?.content).toMatch(/You said: .hold me./);
  });

  it("holds one turn only: the next turn runs free", async () => {
    await post("/__test__/chat-config", {
      replyDelayMs: 5,
      holdAfterFirstDelta: true,
    });
    await post(`${convo("hold-one")}/messages`, { text: "first" });
    await post("/__test__/drop-chat-streams");
    await settle(300);
    await post(`${convo("hold-two")}/messages`, { text: "second" });
    await settle(300);
    expect(
      (await history("hold-two")).some((m) => m.role === "assistant"),
    ).toBe(true);
  });
});

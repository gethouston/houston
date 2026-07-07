/**
 * Native-bridge contract: the dispatcher (`src/bridge/`) driven end-to-end by a
 * scripted native host, with `ports.fetch` routed through the bridge-fetch
 * message pair so the SSE streaming path is proven over the pipe — not mocked.
 *
 * Covers: handshake, session attach (storage round-trip), agents command +
 * subscription push, a full send -> streamed conversation snapshots -> settle,
 * abort propagation on dispose, malformed-input replies, and teardown.
 */

import {
  FAKE_TOKEN,
  type FakeHost,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
  SEED_WORKSPACE_ID,
  startFakeHost,
} from "@houston/fake-host";
import {
  AGENTS_SCOPE,
  AgentsCommand,
  CONNECTION_SCOPE,
  type ConversationVM,
  conversationScope,
  SESSION_TOKEN_KEY,
  SET_TOKEN_COMMAND,
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
import { ScriptedHost } from "./bridge-host";

let host: FakeHost;
beforeAll(async () => {
  host = await startFakeHost(0);
});
afterAll(async () => {
  await host.stop();
});

async function resetHost(url: string): Promise<void> {
  await fetch(`${url}/__test__/reset`, { method: "POST" });
}

let h: ScriptedHost;
beforeEach(async () => {
  await resetHost(host.url);
  h = new ScriptedHost();
});
afterEach(() => {
  h.bridge.dispose();
});

const seedUsage = { context_tokens: 1200, output_tokens: 80, cached_tokens: 0 };
const cannedReply = (text: string): string => `Roger that. You said: "${text}"`;

describe("handshake + configure", () => {
  it("replies ready v:1 to configure and reads the token from native storage", async () => {
    await h.configure(host.url);
    expect(h.outbound.find((m) => m.kind === "ready")).toEqual({
      kind: "ready",
      v: 1,
    });
    // Session hydrate reads the persisted token natively over the pipe (this
    // port I/O may precede `ready`, as it fires during SDK construction).
    expect(
      h.outbound.some(
        (m) => m.kind === "storage/get" && m.key === SESSION_TOKEN_KEY,
      ),
    ).toBe(true);
  });

  it("rejects a second configure", async () => {
    await h.configure(host.url);
    h.deliver({ kind: "configure", baseUrl: host.url });
    expect(
      h.outbound.some(
        (m) => m.kind === "error" && /already configured/.test(m.message),
      ),
    ).toBe(true);
  });
});

describe("session attach (storage round-trip)", () => {
  it("persists the token natively and flips the connection VM", async () => {
    await h.configure(host.url);
    const sub = await h.subscribe("s-conn", CONNECTION_SCOPE);
    expect((sub.snapshot as { hasToken: boolean }).hasToken).toBe(false);

    const result = await h.command(SET_TOKEN_COMMAND, { token: FAKE_TOKEN });
    expect(result.ok).toBe(true);
    // The token really landed in the host-backed store via storage/set.
    expect(h.storage.get(SESSION_TOKEN_KEY)).toBe(FAKE_TOKEN);

    await h.until(
      () =>
        h
          .snapshots("s-conn")
          .some((s) => (s.snapshot as { hasToken: boolean }).hasToken),
      "connection VM flipped hasToken",
    );
  });
});

describe("agents command + subscription", () => {
  it("returns the list and pushes the seed snapshot to the scope", async () => {
    await h.configure(host.url);
    await h.subscribe("s-agents", AGENTS_SCOPE);
    const result = await h.command(AgentsCommand.Refresh);
    expect(result.ok).toBe(true);

    await h.until(
      () =>
        h
          .snapshots("s-agents")
          .some((s) => (s.snapshot as { items: unknown[] }).items.length === 1),
      "agents snapshot pushed",
    );
    const last = h.snapshots("s-agents").at(-1)?.snapshot as {
      loaded: boolean;
      items: { id: string; name: string; workspaceId: string }[];
    };
    expect(last.loaded).toBe(true);
    expect(last.items[0]).toEqual({
      id: SEED_AGENT_ID,
      name: SEED_AGENT_NAME,
      workspaceId: SEED_WORKSPACE_ID,
      createdAt: Date.UTC(2024, 0, 1),
    });
  });
});

describe("send -> stream -> settle (bridge-fetch streaming path)", () => {
  it("drives streamed conversation snapshots through settle", async () => {
    const cid = "cv-bridge";
    await h.configure(host.url);
    await h.command(SET_TOKEN_COMMAND, { token: FAKE_TOKEN });
    await h.subscribe("s-conv", conversationScope(SEED_AGENT_ID, cid));

    const sent = await h.command("turns/send", {
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });
    expect(sent.ok).toBe(true);

    await h.until(
      () =>
        h
          .snapshots("s-conv")
          .some((s) => (s.snapshot as ConversationVM).running === false),
      "conversation settled over the bridge",
    );

    const settled = h
      .snapshots("s-conv")
      .map((s) => s.snapshot as ConversationVM)
      .filter((vm) => vm.running === false)
      .pop();
    // Every feed entry now carries a stamped epoch-ms `ts`; assert it is present
    // and numeric, then compare the rest of the VM structurally (ts stripped).
    for (const f of settled?.feed ?? []) expect(typeof f.ts).toBe("number");
    expect({
      ...settled,
      feed: (settled?.feed ?? []).map(({ ts, ...rest }) => rest),
    }).toEqual({
      running: false,
      sessionStatus: "completed",
      boardStatus: "needs_you",
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

    // The streaming SSE really flowed as base64 fetch/chunk messages over the
    // pipe (host->SDK), and the SSE GET went out as a bridge-fetch.
    expect(h.chunkCount).toBeGreaterThan(0);
    expect(
      h.outbound.some(
        (m) => m.kind === "fetch/start" && m.url.includes("/events"),
      ),
    ).toBe(true);
  });
});

describe("abort propagation", () => {
  it("sends fetch/abort for the in-flight SSE stream on dispose", async () => {
    const cid = "cv-abort";
    await h.configure(host.url);
    await fetch(`${host.url}/__test__/chat-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyDelayMs: 200 }),
    });
    await h.subscribe("s-abort", conversationScope(SEED_AGENT_ID, cid));
    await h.command("turns/send", {
      agentId: SEED_AGENT_ID,
      conversationId: cid,
      text: "Ping",
    });

    await h.until(
      () =>
        h.outbound.some(
          (m) => m.kind === "fetch/start" && m.url.includes("/events"),
        ),
      "SSE stream opened over the bridge",
    );
    const events = h.outbound.find(
      (m) => m.kind === "fetch/start" && m.url.includes("/events"),
    );
    const eventsId = (events as { id: string }).id;

    h.bridge.dispose();
    expect(
      h.outbound.some((m) => m.kind === "fetch/abort" && m.id === eventsId),
    ).toBe(true);
  });
});

describe("malformed input + lifecycle replies", () => {
  it("replies error on non-JSON and on a kind-less object", () => {
    h.deliverRaw("this is not json");
    expect(h.outbound.at(-1)).toEqual({
      kind: "error",
      message: "malformed message: not JSON",
    });
    h.deliver({ noKind: true });
    expect(h.outbound.at(-1)).toEqual({
      kind: "error",
      message: "message must be an object with a string 'kind'",
    });
  });

  it("replies a result for a malformed command envelope, echoing its id", async () => {
    await h.configure(host.url);
    const before = h.outbound.length;
    h.deliver({ kind: "command", envelope: { id: "x9" } });
    await h.until(
      () => h.outbound.slice(before).some((m) => m.kind === "result"),
      "malformed-envelope result",
    );
    expect(
      h.outbound.find((m) => m.kind === "result" && m.result.id === "x9"),
    ).toEqual({
      kind: "result",
      result: {
        id: "x9",
        ok: false,
        error: { message: "invalid command envelope" },
      },
    });
  });

  it("replies not-configured for a command before configure", () => {
    h.deliver({
      kind: "command",
      envelope: { id: "c0", type: "agents/refresh" },
    });
    expect(h.outbound.at(-1)).toEqual({
      kind: "result",
      result: { id: "c0", ok: false, error: { message: "not configured" } },
    });
  });

  it("ignores an unknown kind (inert) and an unknown unsubscribe (no-op)", () => {
    h.deliver({ kind: "totally-new-frame", extra: 1 });
    h.deliver({ kind: "unsubscribe", sub: "never-subscribed" });
    expect(h.outbound).toEqual([]);
  });

  it("stops dispatching after dispose", async () => {
    await h.configure(host.url);
    h.bridge.dispose();
    const result = await h.command("agents/refresh");
    expect(result).toEqual({
      id: "c1",
      ok: false,
      error: { message: "not configured" },
    });
  });
});

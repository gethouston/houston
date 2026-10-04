import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { asPrewarmInput, TurnsHttpError } from "./conversation-prewarm";
import { PREWARM_REFRESH_MS } from "./draft-prewarm";

const BASE = "https://gw.example";
const LAUNCHING = { outcome: "launching", holdMs: 30_000 };

interface Call {
  url: string;
  method: string;
  body: string | null;
  contentType: string | null;
}

/** A real SDK over a recording fetch and a clock the test moves. */
function sdk(answer: () => Response = () => json(202, LAUNCHING)) {
  const calls: Call[] = [];
  let now = 0;
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : null,
        contentType: new Headers(init?.headers).get("Content-Type"),
      });
      return answer();
    },
  );
  const ports: SdkPorts = {
    fetch: fetchImpl as typeof fetch,
    storage: memoryKv(),
    devicePreferences: memoryKv(),
    clock: { now: () => now, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: `${BASE}/`, ports, reactivity: false };
  const advance = (ms: number) => {
    now += ms;
  };
  return { client: new HoustonSdk(config), calls, advance };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

describe("turns.prewarm", () => {
  it("posts the composer's pin to the gateway's prewarm route", async () => {
    const { client, calls } = sdk();
    const answer = await client.turns.prewarm("activity-c 1", "sales/team", {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    });
    expect(answer).toEqual(LAUNCHING);
    expect(calls).toEqual([
      {
        url: `${BASE}/v1/agents/sales%2Fteam/conversations/activity-c%201/prewarm`,
        method: "POST",
        body: '{"provider":"anthropic","model":"claude-sonnet-4-6"}',
        contentType: "application/json",
      },
    ]);
  });

  it("sends an empty object when the composer has no pin", async () => {
    const { client, calls } = sdk();
    await client.turns.prewarm("activity-c1", "sales");
    expect(calls[0]?.body).toBe("{}");
  });

  it("throws the module's typed error with the gateway's status", async () => {
    const { client } = sdk(() =>
      json(503, { error: "prewarm not configured", code: "not_configured" }),
    );
    const failure = client.turns.prewarm("activity-c1", "sales");
    await expect(failure).rejects.toBeInstanceOf(TurnsHttpError);
    await expect(failure).rejects.toMatchObject({
      name: "TurnsHttpError",
      status: 503,
    });
  });

  it("the turns/prewarm command takes the same route", async () => {
    const { client, calls } = sdk();
    const result = await client.dispatch({
      id: "p",
      type: "turns/prewarm",
      payload: {
        agentId: "sales",
        conversationId: "activity-c1",
        input: { model: "gpt-5.5" },
      },
    });
    expect(result).toMatchObject({ ok: true, value: LAUNCHING });
    expect(calls).toEqual([
      {
        url: `${BASE}/v1/agents/sales/conversations/activity-c1/prewarm`,
        method: "POST",
        body: '{"model":"gpt-5.5"}',
        contentType: "application/json",
      },
    ]);
  });
});

describe("asPrewarmInput", () => {
  it("requires the conversation and agent and keeps only string pins", () => {
    expect(() => asPrewarmInput({ conversationId: "c1" })).toThrow();
    expect(() =>
      asPrewarmInput({ conversationId: "c1", agentId: "a", input: "x" }),
    ).toThrow();
    expect(
      asPrewarmInput({
        conversationId: "c1",
        agentId: "a",
        input: { provider: 7, model: "m" },
      }),
    ).toEqual({ conversationId: "c1", agentId: "a", input: { model: "m" } });
    expect(asPrewarmInput({ conversationId: "c1", agentId: "a" })).toEqual({
      conversationId: "c1",
      agentId: "a",
    });
  });
});

describe("turns.draftChanged and claimNewConversationId", () => {
  it("prewarm a new chat under the id its first send then claims", async () => {
    const { client, calls, advance } = sdk();
    const draft = { agentId: "sales", draftKey: "new-conversation:board" };
    await client.turns.draftChanged(
      { ...draft, text: "h" },
      { conversationPrewarm: true },
    );
    await client.turns.draftChanged(
      { ...draft, text: "he" },
      { conversationPrewarm: true },
    );
    advance(PREWARM_REFRESH_MS);
    await client.turns.draftChanged(
      { ...draft, text: "hel" },
      { conversationPrewarm: true },
    );
    const id = client.turns.claimNewConversationId(draft.draftKey);
    const url = `${BASE}/v1/agents/sales/conversations/activity-${id}/prewarm`;
    expect(calls.map((call) => call.url)).toEqual([url, url]);
  });

  it("asks nothing of a deployment without the capability", async () => {
    const { client, calls } = sdk();
    await client.turns.draftChanged(
      { agentId: "sales", draftKey: "activity-c1", text: "hello" },
      undefined,
    );
    expect(calls).toEqual([]);
  });

  it("rejects with the prewarm's error so the surface can report it", async () => {
    const { client } = sdk(() => json(500, { error: "registry unavailable" }));
    await expect(
      client.turns.draftChanged(
        {
          agentId: "sales",
          draftKey: "activity-c1",
          conversationId: "activity-c1",
          text: "hello",
        },
        { conversationPrewarm: true },
      ),
    ).rejects.toMatchObject({ name: "TurnsHttpError", status: 500 });
  });

  it("claims a fresh id when nothing was typed", () => {
    const { client } = sdk();
    const one = client.turns.claimNewConversationId("new-conversation:x");
    const two = client.turns.claimNewConversationId("new-conversation:x");
    expect(one).toMatch(/^[0-9a-f-]{32,36}$/);
    expect(two).not.toBe(one);
  });
});

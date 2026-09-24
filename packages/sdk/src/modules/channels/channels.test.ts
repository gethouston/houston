import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { ChannelsCommand, ChannelsHttpError } from "./index";

const BASE = "http://127.0.0.1:4317";
const TICKET = "Tk7-ticket.value_~9";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

const CONNECTION = {
  id: "connection-1",
  provider: "slack" as const,
  accountLabel: "Ada · Team",
  spaceId: "personal",
  createdAt: "2026-09-08T12:00:00Z",
};

const STATUS = {
  providers: [{ id: "slack" as const, name: "Slack", configured: true }],
  connections: [CONNECTION],
};

/**
 * A channels SDK over a mock `fetch` that records the whole wire. `reactivity`
 * is off, so every recorded call is one a channels operation made and nothing
 * else — which is what makes "exactly one request" an exact claim.
 */
function makeSdk(answer: () => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(input),
        body: typeof init?.body === "string" ? init.body : null,
      });
      return answer();
    },
  );
  const store = new Map<string, string>();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(store),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const ok = (body: unknown) => makeSdk(() => json(body));

describe("the channels requests", () => {
  it("reads the space's providers and connections off GET /v1/channels", async () => {
    const { sdk, calls } = ok(STATUS);
    expect(await sdk.channels.getChannels()).toEqual(STATUS);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/channels`, body: null },
    ]);
  });

  it("starts the Slack install with an empty JSON body", async () => {
    const url = "https://slack.com/oauth/v2/authorize?state=opaque";
    const { sdk, calls } = ok({ url });
    expect(await sdk.channels.connectSlack()).toEqual({ url });
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/v1/channels/slack/connect`,
        body: "{}",
      },
    ]);
  });

  it("mints a pairing code for an already-installed workspace", async () => {
    const link = { code: "ABCD-1234", expiresAt: "2026-09-08T13:00:00Z" };
    const { sdk, calls } = ok(link);
    expect(await sdk.channels.linkSlack()).toEqual(link);
    expect(calls).toEqual([
      { method: "POST", url: `${BASE}/v1/channels/slack/link`, body: "{}" },
    ]);
  });

  it("redeems the callback ticket as the whole body", async () => {
    const { sdk, calls } = ok({ connection: CONNECTION });
    expect(await sdk.channels.completeSlack(TICKET)).toEqual({
      connection: CONNECTION,
    });
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/v1/channels/slack/complete`,
        body: JSON.stringify({ ticket: TICKET }),
      },
    ]);
  });

  it("escapes the connection id into the route that removes it", async () => {
    const { sdk, calls } = makeSdk(() => new Response(null, { status: 204 }));
    await sdk.channels.disconnectChannel("connection/a");
    expect(calls).toEqual([
      {
        method: "DELETE",
        url: `${BASE}/v1/channels/connections/connection%2Fa`,
        body: null,
      },
    ]);
  });
});

describe("what the module refuses to soften", () => {
  // A deployment with no channels at all (404/501) and one whose Slack app is
  // not configured (503) are states a SCREEN renders, not answers the SDK may
  // invent: a surface that cannot tell them from "could not ask" shows a lie.
  for (const status of [404, 501, 503]) {
    it(`throws a ChannelsHttpError carrying the status — a ${status} never degrades`, async () => {
      const { sdk } = makeSdk(() =>
        json({ error: "no channels here" }, status),
      );
      const err = await sdk.channels.getChannels().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ChannelsHttpError);
      expect((err as ChannelsHttpError).status).toBe(status);
      // The body travels as the message, which is what the web adapter parses
      // back into a HoustonEngineError.
      expect((err as ChannelsHttpError).message).toBe(
        JSON.stringify({ error: "no channels here" }),
      );
    });
  }

  it("a refused ticket reaches the caller with its status intact", async () => {
    const { sdk, calls } = makeSdk(() => json({ error: "spent" }, 404));
    const err = await sdk.channels.completeSlack(TICKET).catch((e) => e);
    expect((err as ChannelsHttpError).status).toBe(404);
    // A one-time ticket is never replayed: one refusal is one request.
    expect(calls).toHaveLength(1);
  });
});

describe("the dispatch path", () => {
  it("dispatches a disconnect through the same handler the facade uses", async () => {
    const { sdk, calls } = makeSdk(() => new Response(null, { status: 204 }));
    const result = await sdk.dispatch({
      id: "1",
      type: ChannelsCommand.Disconnect,
      payload: { connectionId: "connection-1" },
    });
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe(`${BASE}/v1/channels/connections/connection-1`);
  });

  it("refuses a ticket no callback could have minted, without touching the wire", async () => {
    const { sdk, calls } = ok({ connection: CONNECTION });
    for (const ticket of ["", "short", "has space", "a".repeat(257), "a/b"]) {
      const result = await sdk.dispatch({
        id: "2",
        type: ChannelsCommand.CompleteSlack,
        payload: { ticket },
      });
      expect(result.ok).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it("reads the listing through dispatch with no payload at all", async () => {
    const { sdk, calls } = ok(STATUS);
    const result = await sdk.dispatch({ id: "3", type: ChannelsCommand.Get });
    expect(result).toMatchObject({ ok: true, value: STATUS });
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/channels`, body: null },
    ]);
  });
});

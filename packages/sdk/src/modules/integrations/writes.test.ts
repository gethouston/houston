import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { IntegrationsCommand } from "./index";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

/** A write-only SDK (`reactivity:false`) over a mock `fetch` recording every
 *  `/v1/integrations` call. The refetching facade `disconnect` ends with a
 *  `refresh()` (GET /v1/integrations …); a no-refetch write issues no GET. */
function makeSdk() {
  const calls: Recorded[] = [];
  const json = (b: unknown) =>
    new Response(JSON.stringify(b), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body =
        init?.body === undefined ? undefined : JSON.parse(String(init.body));
      calls.push({ method, path: url.pathname, body });
      const p = url.pathname;
      if (p.endsWith("/connect"))
        return json({ redirectUrl: "u", connectionId: "c1" });
      if (p === "/v1/integrations")
        return json({ items: [{ provider: "composio", ready: true }] });
      if (p.endsWith("/toolkits") || p.endsWith("/connections"))
        return json({ items: [] });
      return json({ ok: true });
    },
  );
  const store = new Map<string, string>();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: {
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => void store.set(k, v),
      delete: async (k) => void store.delete(k),
    },
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls };
}

const I = "/v1/integrations";
const gets = (c: Recorded[]) => c.filter((x) => x.method === "GET");

describe("integrations module — connect overload", () => {
  it("connect(toolkit) posts { toolkit } to the composio route (legacy, iOS-safe)", async () => {
    const { sdk, calls } = makeSdk();
    const res = await sdk.integrations.connect("gmail");
    expect(res).toEqual({ redirectUrl: "u", connectionId: "c1" });
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${I}/composio/connect`,
        body: { toolkit: "gmail" },
      },
    ]);
    sdk.dispose();
  });

  it("connect(provider, toolkit, agent) posts { toolkit, agent } to the provider route", async () => {
    const { sdk, calls } = makeSdk();
    await sdk.integrations.connect("composio", "gmail", "ag_1");
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${I}/composio/connect`,
        body: { toolkit: "gmail", agent: "ag_1" },
      },
    ]);
    sdk.dispose();
  });

  it("the bridge dispatch path still posts the legacy composio { toolkit } body", async () => {
    const { sdk, calls } = makeSdk();
    const ok = await sdk.dispatch({
      id: "c1",
      type: IntegrationsCommand.Connect,
      payload: { toolkit: "slack" },
    });
    expect(ok).toMatchObject({ id: "c1", ok: true });
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${I}/composio/connect`,
        body: { toolkit: "slack" },
      },
    ]);
    sdk.dispose();
  });
});

describe("integrations module — no-refetch writes + session/notice ops", () => {
  it("writes.disconnect POSTs disconnect and does NOT refetch", async () => {
    const { sdk, calls } = makeSdk();
    await sdk.integrations.writes.disconnect("gmail");
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${I}/composio/disconnect`,
        body: { toolkit: "gmail" },
      },
    ]);
    expect(gets(calls)).toEqual([]);
    sdk.dispose();
  });

  it("the refetching facade disconnect() DOES refetch afterward (contrast)", async () => {
    const { sdk, calls } = makeSdk();
    await sdk.integrations.disconnect("gmail");
    // POST then the refresh reads: GET /v1/integrations, toolkits, connections.
    expect(calls[0]).toEqual({
      method: "POST",
      path: `${I}/composio/disconnect`,
      body: { toolkit: "gmail" },
    });
    expect(gets(calls).map((c) => c.path)).toEqual([
      I,
      `${I}/composio/toolkits`,
      `${I}/composio/connections`,
    ]);
    sdk.dispose();
  });

  it("setSession PUTs { token } to the gateway session sink", async () => {
    const { sdk, calls } = makeSdk();
    await sdk.integrations.setSession("jwt-1");
    expect(calls).toEqual([
      { method: "PUT", path: `${I}/session`, body: { token: "jwt-1" } },
    ]);
    sdk.dispose();
  });

  it("setSession(null) PUTs { token: null } (sign-out)", async () => {
    const { sdk, calls } = makeSdk();
    await sdk.integrations.setSession(null);
    expect(calls).toEqual([
      { method: "PUT", path: `${I}/session`, body: { token: null } },
    ]);
    sdk.dispose();
  });

  it("dismissReconnectNotice POSTs the dismiss route", async () => {
    const { sdk, calls } = makeSdk();
    await sdk.integrations.dismissReconnectNotice();
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${I}/reconnect-notice/dismiss`,
        body: undefined,
      },
    ]);
    sdk.dispose();
  });
});

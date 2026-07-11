import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { providersScope } from "./index";

const BASE = "http://127.0.0.1:4317";
const AGENT = "ag_1";
const root = `/agents/${AGENT}`;

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

/**
 * A write-only SDK (`reactivity:false`) over a mock `fetch` recording every
 * per-agent runtime call. The refetching facade writes end with a full
 * `refresh()` = `GET /providers` + `GET /auth/status`; a no-refetch write must
 * NOT issue that trailing `GET /auth/status`, so counting it pins "no refetch".
 */
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
      if (p.endsWith("/auth/status"))
        return json({ activeProvider: "claude", providers: [] });
      if (p.endsWith("/providers"))
        return json([
          {
            id: "claude",
            name: "Claude",
            configured: true,
            activeModel: "",
            models: ["opus"],
          },
        ]);
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

const statusGets = (calls: Recorded[]) =>
  calls.filter((c) => c.method === "GET" && c.path.endsWith("/auth/status"));

describe("providers module — no-refetch writes", () => {
  it("writes.status GETs /auth/status, returns it, publishes nothing", async () => {
    const { sdk, calls } = makeSdk();
    const status = await sdk.providers.writes.status(AGENT);
    expect(calls).toEqual([
      { method: "GET", path: `${root}/auth/status`, body: undefined },
    ]);
    expect(status).toEqual({ activeProvider: "claude", providers: [] });
    expect(sdk.getSnapshot(providersScope(AGENT))).toBeUndefined();
    sdk.dispose();
  });

  it("writes.setApiKey POSTs the key and does NOT refetch", async () => {
    const { sdk, calls } = makeSdk();
    await sdk.providers.writes.setApiKey(AGENT, "openai", "sk-1");
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${root}/auth/openai/api-key`,
        body: { key: "sk-1" },
      },
    ]);
    expect(statusGets(calls)).toEqual([]);
    sdk.dispose();
  });

  it("writes.logout POSTs logout and does NOT refetch", async () => {
    const { sdk, calls } = makeSdk();
    await sdk.providers.writes.logout(AGENT, "claude");
    expect(calls).toEqual([
      { method: "POST", path: `${root}/auth/claude/logout`, body: undefined },
    ]);
    expect(statusGets(calls)).toEqual([]);
    sdk.dispose();
  });

  it("writes.setModel resolves the provider then PUTs settings, no status refetch", async () => {
    const { sdk, calls } = makeSdk();
    await sdk.providers.writes.setModel(AGENT, { model: "opus" });
    expect(calls).toEqual([
      { method: "GET", path: `${root}/providers`, body: undefined },
      {
        method: "PUT",
        path: `${root}/settings`,
        body: { activeProvider: "claude", model: "opus" },
      },
    ]);
    // The refetching facade would add a trailing GET /auth/status; the write does not.
    expect(statusGets(calls)).toEqual([]);
    sdk.dispose();
  });

  it("writes.setCustomEndpoint POSTs the endpoint (no facade sibling), no refetch", async () => {
    const { sdk, calls } = makeSdk();
    const endpoint = { baseUrl: "http://localhost:1234/v1", model: "llama" };
    await sdk.providers.writes.setCustomEndpoint(AGENT, endpoint);
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${root}/providers/openai-compatible`,
        body: endpoint,
      },
    ]);
    expect(statusGets(calls)).toEqual([]);
    sdk.dispose();
  });
});

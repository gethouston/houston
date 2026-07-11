import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKEN_EXPIRED_EVENT } from "../../auth-expiry";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import type { SdkEvent } from "../../store";
import { createAuthFetch } from "../session/auth-fetch";
import {
  AGENTS_SCOPE,
  AgentsCommand,
  type AgentsViewModel,
  type WireAgent,
} from "./index";

const BASE = "http://127.0.0.1:4317";

// ── a controllable /v1/events SSE source ────────────────────────────────────
interface Sse {
  response: Response;
  push(obj: unknown): void;
  close(): void;
}
function makeSse(): Sse {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c;
    },
  });
  return {
    response: new Response(stream, { status: 200 }),
    push: (obj) =>
      controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)),
    close: () => controller.close(),
  };
}
/** An SSE response whose body ends immediately (drives a reconnect). */
function closedSse(): Response {
  const sse = makeSse();
  sse.close();
  return sse.response;
}
/** An events fetch that never resolves — the stream stays "connecting". */
function neverConnects(): Promise<Response> {
  return new Promise<Response>(() => {});
}

// ── a fake clock whose timers fire only when flushed ────────────────────────
function makeClock() {
  let seq = 1;
  const timers = new Map<number, () => void>();
  return {
    clock: {
      now: () => 0,
      setTimeout: (fn: () => void) => {
        const id = seq++;
        timers.set(id, fn);
        return id;
      },
      clearTimeout: (id: number) => void timers.delete(id),
    },
    pending: () => timers.size,
    flush: () => {
      const fns = [...timers.values()];
      timers.clear();
      for (const fn of fns) fn();
    },
  };
}

interface Harness {
  sdk: HoustonSdk;
  ports: SdkPorts;
  clock: ReturnType<typeof makeClock>;
  events: SdkEvent[];
  state: {
    agents: WireAgent[];
    listCalls: number;
    posted: unknown[];
    /** Every non-GET `/agents` call (POST/PATCH/DELETE): method + path + body. */
    mutations: { method: string; path: string; body?: unknown }[];
    eventsResponder: () => Response | Promise<Response>;
  };
}

function makeHarness(
  overrides: {
    agents?: WireAgent[];
    agentsStatus?: number;
    eventsResponder?: () => Response | Promise<Response>;
    /** `false` opens NO `/v1/events` stream (write-only host), so no background
     *  refetch can confound a "does not refetch" assertion. Default: on. */
    reactivity?: boolean;
  } = {},
): Harness {
  const clock = makeClock();
  const state: Harness["state"] = {
    agents: overrides.agents ?? [],
    listCalls: 0,
    posted: [],
    mutations: [],
    eventsResponder: overrides.eventsResponder ?? closedSse,
  };
  const path = (url: string) => new URL(url).pathname;
  const parseBody = (init?: RequestInit) =>
    init?.body === undefined ? undefined : JSON.parse(String(init.body));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/v1/events")) return state.eventsResponder();
      if (url.endsWith("/agents") && method === "GET") {
        state.listCalls++;
        if (overrides.agentsStatus && overrides.agentsStatus !== 200) {
          return new Response("nope", { status: overrides.agentsStatus });
        }
        return json(state.agents);
      }
      if (url.endsWith("/agents") && method === "POST") {
        const body = parseBody(init) as { name: string };
        state.posted.push(body);
        state.mutations.push({ method, path: path(url), body });
        const agent: WireAgent = {
          id: `id-${state.agents.length + 1}`,
          workspaceId: "w1",
          name: body.name,
          createdAt: 1,
        };
        state.agents = [...state.agents, agent];
        return json(agent, 201);
      }
      const single = url.match(/\/agents\/([^/]+)$/);
      if (single && method === "PATCH") {
        const id = decodeURIComponent(single[1]);
        const body = parseBody(init) as { name: string };
        state.mutations.push({ method, path: path(url), body });
        state.agents = state.agents.map((a) =>
          a.id === id ? { ...a, name: body.name } : a,
        );
        return json(state.agents.find((a) => a.id === id));
      }
      if (single && method === "DELETE") {
        const id = decodeURIComponent(single[1]);
        state.mutations.push({ method, path: path(url) });
        state.agents = state.agents.filter((a) => a.id !== id);
        return json({ ok: true });
      }
      throw new Error(`unexpected fetch: ${method} ${url}`);
    },
  );

  const store = new Map<string, string>();
  const storage = {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => void store.set(k, v),
    delete: async (k: string) => void store.delete(k),
  };
  // Model a real host: `ports.fetch` IS the auth-fetch (token stamping + 401
  // reporting with token identity) — a bare fetch would make every 401 look
  // tokenless and be suppressed by the notifier.
  const ports: SdkPorts = {
    fetch: createAuthFetch(fetchImpl as unknown as typeof fetch, storage),
    storage,
    clock: clock.clock,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = {
    baseUrl: BASE,
    ports,
    ...(overrides.reactivity !== undefined
      ? { reactivity: overrides.reactivity }
      : {}),
  };
  const sdk = new HoustonSdk(config);
  const events: SdkEvent[] = [];
  sdk.on((e) => events.push(e));
  return { sdk, ports, clock, events, state };
}

function snapshot(sdk: HoustonSdk): AgentsViewModel | undefined {
  return sdk.getSnapshot(AGENTS_SCOPE) as AgentsViewModel | undefined;
}

const A = (id: string, name: string): WireAgent => ({
  id,
  workspaceId: "w1",
  name,
  createdAt: 1,
});

let disposeCurrent: (() => void) | undefined;
afterEach(() => {
  disposeCurrent?.();
  disposeCurrent = undefined;
});

describe("agents module — list", () => {
  it("publishes {loaded:true, items} after a refresh", async () => {
    const h = makeHarness({ agents: [A("a1", "Ada"), A("a2", "Boole")] });
    disposeCurrent = h.sdk.agents.dispose;
    await h.sdk.agents.refresh();
    expect(snapshot(h.sdk)).toEqual({
      loaded: true,
      items: [
        { id: "a1", name: "Ada", workspaceId: "w1", createdAt: 1 },
        { id: "a2", name: "Boole", workspaceId: "w1", createdAt: 1 },
      ],
    } satisfies AgentsViewModel);
  });

  it("seeds a {loaded:false} snapshot asynchronously, not at construction", async () => {
    // Stream never connects, so its onConnect refetch cannot pre-empt the seed.
    const h = makeHarness({ eventsResponder: neverConnects });
    disposeCurrent = h.sdk.agents.dispose;
    // Synchronous: nothing published yet (kernel contract).
    expect(snapshot(h.sdk)).toBeUndefined();
    await vi.waitFor(() =>
      expect(snapshot(h.sdk)).toEqual({ loaded: false, items: [] }),
    );
  });
});

describe("agents module — mutations refetch", () => {
  it("create posts {name} then refetches the published snapshot", async () => {
    const h = makeHarness({ agents: [] });
    disposeCurrent = h.sdk.agents.dispose;
    await h.sdk.agents.create("Newton");
    expect(h.state.posted).toEqual([{ name: "Newton" }]);
    expect(snapshot(h.sdk)?.items.map((i) => i.name)).toEqual(["Newton"]);
  });

  it("rename then refetch reflects the new name", async () => {
    const h = makeHarness({ agents: [A("a1", "Old")] });
    disposeCurrent = h.sdk.agents.dispose;
    await h.sdk.agents.rename("a1", "New");
    expect(snapshot(h.sdk)?.items[0]?.name).toBe("New");
  });

  it("delete then refetch drops the agent", async () => {
    const h = makeHarness({ agents: [A("a1", "Gone"), A("a2", "Stay")] });
    disposeCurrent = h.sdk.agents.dispose;
    await h.sdk.agents.delete("a1");
    expect(snapshot(h.sdk)?.items.map((i) => i.id)).toEqual(["a2"]);
  });

  it("runs the same handler through the bridge dispatch path", async () => {
    const h = makeHarness({ agents: [] });
    disposeCurrent = h.sdk.agents.dispose;
    const ok = await h.sdk.dispatch({
      id: "c1",
      type: AgentsCommand.Create,
      payload: { name: "Bridged" },
    });
    expect(ok).toEqual({ id: "c1", ok: true, value: undefined });
    expect(snapshot(h.sdk)?.items.map((i) => i.name)).toEqual(["Bridged"]);
  });

  it("rejects a create with a missing name as ok:false", async () => {
    const h = makeHarness({ agents: [] });
    disposeCurrent = h.sdk.agents.dispose;
    const res = await h.sdk.dispatch({
      id: "c2",
      type: AgentsCommand.Create,
      payload: {},
    });
    expect(res).toEqual({
      id: "c2",
      ok: false,
      error: { message: "missing 'name'" },
    });
  });
});

describe("agents module — reactivity", () => {
  it("refetches on (re)connect after the stream drops and the backoff fires", async () => {
    // Every /v1/events connection ends immediately, driving a reconnect.
    const h = makeHarness({ agents: [A("a1", "Ada")] });
    disposeCurrent = h.sdk.agents.dispose;
    // First connect → onConnect refetch (#1).
    await vi.waitFor(() => expect(h.state.listCalls).toBe(1));
    // The loop is now parked in the backoff sleep (a pending timer).
    await vi.waitFor(() => expect(h.clock.pending()).toBeGreaterThan(0));
    expect(h.state.listCalls).toBe(1); // gated on the backoff, no early refetch
    h.clock.flush(); // fire the backoff → reconnect
    await vi.waitFor(() => expect(h.state.listCalls).toBe(2));
  });

  it("refetches when an AgentsChanged frame arrives on a live stream", async () => {
    const sse = makeSse();
    const h = makeHarness({
      agents: [A("a1", "Ada")],
      eventsResponder: () => sse.response,
    });
    disposeCurrent = () => {
      sse.close();
      h.sdk.agents.dispose();
    };
    await vi.waitFor(() =>
      expect(snapshot(h.sdk)?.items.map((i) => i.id)).toEqual(["a1"]),
    );
    // A new agent appears server-side; the AgentsChanged frame must pull it in.
    h.state.agents = [A("a1", "Ada"), A("a2", "Boole")];
    sse.push({ type: "AgentsChanged", workspaceId: "w1" });
    await vi.waitFor(() =>
      expect(snapshot(h.sdk)?.items.map((i) => i.id)).toEqual(["a1", "a2"]),
    );
  });

  it("ignores unrelated event frames", async () => {
    const sse = makeSse();
    const h = makeHarness({
      agents: [A("a1", "Ada")],
      eventsResponder: () => sse.response,
    });
    disposeCurrent = () => {
      sse.close();
      h.sdk.agents.dispose();
    };
    await vi.waitFor(() => expect(h.state.listCalls).toBe(1));
    sse.push({ type: "ActivityChanged", agentPath: "a1" });
    sse.push({ type: "AgentsChanged", workspaceId: "w1" });
    await vi.waitFor(() => expect(h.state.listCalls).toBe(2));
    // The ActivityChanged frame did not add its own refetch.
    expect(h.state.listCalls).toBe(2);
  });
});

describe("agents module — no-refetch writes", () => {
  // reactivity:false → no /v1/events stream, so `listCalls` (GET /agents) counts
  // ONLY a facade refresh(). A write variant must leave it at 0.
  it("writes.create posts the full body, returns the agent, and does NOT refetch", async () => {
    const h = makeHarness({ agents: [], reactivity: false });
    disposeCurrent = h.sdk.agents.dispose;
    const created = await h.sdk.agents.writes.create({
      name: "Newton",
      claudeMd: "# hi",
      seeds: { "a.txt": "x" },
    });
    expect(h.state.mutations).toEqual([
      {
        method: "POST",
        path: "/agents",
        body: { name: "Newton", claudeMd: "# hi", seeds: { "a.txt": "x" } },
      },
    ]);
    expect(created).toMatchObject({ id: "id-1", name: "Newton" });
    expect(h.state.listCalls).toBe(0); // no refresh() GET
    // The write publishes NOTHING itself: any snapshot is only the module's
    // async loading seed, never the created agent.
    expect(snapshot(h.sdk)?.items ?? []).toEqual([]);
  });

  it("writes.create with only a name posts exactly {name} (iOS-identical body)", async () => {
    const h = makeHarness({ agents: [], reactivity: false });
    disposeCurrent = h.sdk.agents.dispose;
    await h.sdk.agents.writes.create({ name: "Solo" });
    expect(h.state.mutations[0]?.body).toEqual({ name: "Solo" });
  });

  it("writes.rename PATCHes and returns the updated agent, no refetch", async () => {
    const h = makeHarness({ agents: [A("a1", "Old")], reactivity: false });
    disposeCurrent = h.sdk.agents.dispose;
    const renamed = await h.sdk.agents.writes.rename("a1", "New");
    expect(h.state.mutations).toEqual([
      { method: "PATCH", path: "/agents/a1", body: { name: "New" } },
    ]);
    expect(renamed).toMatchObject({ id: "a1", name: "New" });
    expect(h.state.listCalls).toBe(0);
  });

  it("writes.delete DELETEs and does NOT refetch", async () => {
    const h = makeHarness({ agents: [A("a1", "Gone")], reactivity: false });
    disposeCurrent = h.sdk.agents.dispose;
    await h.sdk.agents.writes.delete("a1");
    expect(h.state.mutations).toEqual([
      { method: "DELETE", path: "/agents/a1" },
    ]);
    expect(h.state.listCalls).toBe(0);
  });
});

describe("agents module — 401 → session tokenExpired", () => {
  it("emits a tokenExpired event and rejects the refresh on 401", async () => {
    // Both /agents and /v1/events answer 401 → the stream connect never refetches.
    const h = makeHarness({
      agentsStatus: 401,
      eventsResponder: () => new Response("nope", { status: 401 }),
    });
    disposeCurrent = h.sdk.agents.dispose;
    // A CURRENT token must be attached for a 401 to mean "expired" — the
    // notifier suppresses tokenless and stale-token 401s by design.
    await h.sdk.session.setToken("tok-1");
    await expect(h.sdk.agents.refresh()).rejects.toMatchObject({ status: 401 });
    // The shared notifier emits one canonical `session/tokenExpired` (no scope),
    // deduped per token value across every module.
    expect(h.events.some((e) => e.type === TOKEN_EXPIRED_EVENT)).toBe(true);
  });

  it("does NOT emit tokenExpired for a tokenless 401 (nothing to expire)", async () => {
    const h = makeHarness({
      agentsStatus: 401,
      eventsResponder: () => new Response("nope", { status: 401 }),
    });
    disposeCurrent = h.sdk.agents.dispose;
    await expect(h.sdk.agents.refresh()).rejects.toMatchObject({ status: 401 });
    expect(h.events.some((e) => e.type === TOKEN_EXPIRED_EVENT)).toBe(false);
  });
});

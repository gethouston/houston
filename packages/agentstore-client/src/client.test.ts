import { describe, expect, it } from "vitest";
import { AgentStoreClient, STORE_API_PREFIX } from "./client";
import { StoreApiError } from "./errors";

const BASE = "https://gw.example.com";

interface RecordedCall {
  url: string;
  init: RequestInit;
}

/**
 * A fetch stub that records every call and returns a queued Response (or the
 * single default). `bodyOf`/`headersOf` read back what the client sent.
 */
function stubFetch(responses: Response | Response[]): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return next as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** A throwing fetch, to exercise the network-failure path. */
function rejectingFetch(err: unknown): typeof fetch {
  return (async () => {
    throw err;
  }) as unknown as typeof fetch;
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textRes(text: string, status: number): Response {
  return new Response(text, {
    status,
    headers: { "content-type": "text/plain" },
  });
}

function headersOf(call: RecordedCall): Headers {
  return new Headers(call.init.headers);
}

function client(
  fetchImpl: typeof fetch,
  getToken?: () => string | null,
): AgentStoreClient {
  return new AgentStoreClient({ baseUrl: BASE, fetchImpl, getToken });
}

describe("AgentStoreClient — URL and query construction", () => {
  it("prefixes the store API path and trims a trailing slash from baseUrl", async () => {
    const { fetchImpl, calls } = stubFetch(
      jsonRes({ items: [], hasMore: false }),
    );
    const c = new AgentStoreClient({ baseUrl: `${BASE}///`, fetchImpl });
    await c.listAgents();
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/agents`);
  });

  it("encodes catalog query params and omits empty/absent ones", async () => {
    const { fetchImpl, calls } = stubFetch(
      jsonRes({ items: [], hasMore: false }),
    );
    await client(fetchImpl).listAgents({
      q: "  inbox triage  ",
      category: "productivity",
      integration: "GMAIL",
      sort: "installs",
      page: 3,
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe(`${STORE_API_PREFIX}/agents`);
    expect(url.searchParams.get("q")).toBe("inbox triage");
    expect(url.searchParams.get("category")).toBe("productivity");
    expect(url.searchParams.get("integration")).toBe("GMAIL");
    expect(url.searchParams.get("sort")).toBe("installs");
    expect(url.searchParams.get("page")).toBe("3");
  });

  it("omits page=1 and blank filters", async () => {
    const { fetchImpl, calls } = stubFetch(
      jsonRes({ items: [], hasMore: false }),
    );
    await client(fetchImpl).listAgents({ q: "   ", page: 1 });
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/agents`);
  });

  it("percent-encodes path segments", async () => {
    const { fetchImpl, calls } = stubFetch(jsonRes({ agent: {}, ir: {} }));
    await client(fetchImpl).getAgent("a/b c");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/agents/a%2Fb%20c`);
  });
});

describe("AgentStoreClient — bearer injection", () => {
  it("attaches Authorization from a sync getToken on authed calls", async () => {
    const { fetchImpl, calls } = stubFetch(jsonRes({ items: [] }));
    await client(fetchImpl, () => "tok-123").listMyAgents();
    expect(headersOf(calls[0]).get("authorization")).toBe("Bearer tok-123");
  });

  it("awaits an async getToken", async () => {
    const { fetchImpl, calls } = stubFetch(jsonRes({ items: [] }));
    const c = new AgentStoreClient({
      baseUrl: BASE,
      fetchImpl,
      getToken: async () => "async-tok",
    });
    await c.listMyAgents();
    expect(headersOf(calls[0]).get("authorization")).toBe("Bearer async-tok");
  });

  it("throws a 401-shaped StoreApiError when getToken yields null, before fetching", async () => {
    const { fetchImpl, calls } = stubFetch(jsonRes({ items: [] }));
    await expect(
      client(fetchImpl, () => null).listMyAgents(),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(0);
  });

  it("throws 401 when no getToken is configured at all", async () => {
    const { fetchImpl } = stubFetch(jsonRes({ items: [] }));
    await expect(client(fetchImpl).listMyAgents()).rejects.toBeInstanceOf(
      StoreApiError,
    );
  });

  it("does not attach Authorization on anonymous calls", async () => {
    const { fetchImpl, calls } = stubFetch(
      jsonRes({ items: [], hasMore: false }),
    );
    await client(fetchImpl, () => "tok").listAgents();
    expect(headersOf(calls[0]).has("authorization")).toBe(false);
  });
});

describe("AgentStoreClient — per-call init/header merge", () => {
  it("shallow-merges init (e.g. Next revalidate) into the fetch call", async () => {
    const { fetchImpl, calls } = stubFetch(
      jsonRes({ items: [], hasMore: false }),
    );
    await client(fetchImpl).listAgents({}, { init: { cache: "no-store" } });
    expect(calls[0].init.cache).toBe("no-store");
    expect(calls[0].init.method).toBe("GET");
  });

  it("merges convenience headers on top of computed headers", async () => {
    const { fetchImpl, calls } = stubFetch(new Response(null, { status: 204 }));
    await client(fetchImpl).recordInstall("slug", "houston", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const h = headersOf(calls[0]);
    expect(h.get("x-forwarded-for")).toBe("1.2.3.4");
    expect(h.get("content-type")).toBe("application/json");
  });

  it("lets init.headers win over both computed and convenience headers", async () => {
    const { fetchImpl, calls } = stubFetch(new Response(null, { status: 204 }));
    await client(fetchImpl).recordInstall("slug", "houston", {
      headers: { "x-trace": "conv" },
      init: { headers: { "x-trace": "init" } },
    });
    expect(headersOf(calls[0]).get("x-trace")).toBe("init");
  });
});

describe("AgentStoreClient — error mapping", () => {
  it("maps a JSON {error} envelope to status + code + message", async () => {
    const { fetchImpl } = stubFetch(jsonRes({ error: "not_owner" }, 403));
    const err = await client(fetchImpl, () => "t")
      .deleteAgent("id")
      .catch((e) => e);
    expect(err).toBeInstanceOf(StoreApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("not_owner");
    expect(err.message).toBe("not_owner");
    expect(err.body).toEqual({ error: "not_owner" });
  });

  it("prefers an explicit code field over the error token", async () => {
    const { fetchImpl } = stubFetch(
      jsonRes({ error: "bad", code: "version_conflict" }, 409),
    );
    const err = await client(fetchImpl)
      .getAgent("s")
      .catch((e) => e);
    expect(err.code).toBe("version_conflict");
  });

  it("keeps raw text as body and a status message on a non-JSON error", async () => {
    const { fetchImpl } = stubFetch(textRes("Bad Gateway", 502));
    const err = await client(fetchImpl)
      .getAgent("s")
      .catch((e) => e);
    expect(err).toBeInstanceOf(StoreApiError);
    expect(err.status).toBe(502);
    expect(err.code).toBeNull();
    expect(err.body).toBe("Bad Gateway");
    expect(err.message).toBe("Gateway request failed (502).");
  });

  it("maps a network rejection to status 0 with the cause on body", async () => {
    const cause = new TypeError("Failed to fetch");
    const err = await client(rejectingFetch(cause))
      .getAgent("s")
      .catch((e) => e);
    expect(err).toBeInstanceOf(StoreApiError);
    expect(err.status).toBe(0);
    expect(err.body).toBe(cause);
    expect(err.message).toBe("Failed to fetch");
  });

  it("throws StoreApiError when a 2xx body is not valid JSON", async () => {
    const { fetchImpl } = stubFetch(textRes("not json", 200));
    const err = await client(fetchImpl)
      .getAgent("s")
      .catch((e) => e);
    expect(err).toBeInstanceOf(StoreApiError);
    expect(err.status).toBe(200);
    expect(err.code).toBeNull();
  });
});

describe("AgentStoreClient — method path + verb coverage", () => {
  const token = () => "tok";

  it("listAgents → GET /agents", async () => {
    const { fetchImpl, calls } = stubFetch(
      jsonRes({ items: [{ id: "1" }], hasMore: true }),
    );
    const page = await client(fetchImpl).listAgents();
    expect(page).toEqual({ items: [{ id: "1" }], hasMore: true });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/agents`);
  });

  it("getAgent → GET /agents/{slug}", async () => {
    const { fetchImpl, calls } = stubFetch(
      jsonRes({ agent: { id: "1" }, ir: { irVersion: "2.0.0" } }),
    );
    const detail = await client(fetchImpl).getAgent("cool-agent");
    expect(detail.agent.id).toBe("1");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/agents/cool-agent`);
  });

  it("listCategories → GET /categories, unwrapping items", async () => {
    const { fetchImpl, calls } = stubFetch(
      jsonRes({ items: [{ slug: "x", name: "X" }] }),
    );
    const cats = await client(fetchImpl).listCategories();
    expect(cats).toEqual([{ slug: "x", name: "X" }]);
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/categories`);
  });

  it("recordInstall → POST /agents/{slug}/installs with the target body", async () => {
    const { fetchImpl, calls } = stubFetch(new Response(null, { status: 204 }));
    await client(fetchImpl).recordInstall("s", "claude_skill_zip");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/agents/s/installs`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      target: "claude_skill_zip",
    });
  });

  it("reportAgent → POST /agents/{slug}/reports with the report body", async () => {
    const { fetchImpl, calls } = stubFetch(new Response(null, { status: 201 }));
    await client(fetchImpl).reportAgent("s", { reason: "spam", details: "d" });
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/agents/s/reports`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      reason: "spam",
      details: "d",
    });
  });

  it("listMyAgents → GET /me/agents, unwrapping items", async () => {
    const { fetchImpl, calls } = stubFetch(jsonRes({ items: [{ id: "1" }] }));
    const mine = await client(fetchImpl, token).listMyAgents();
    expect(mine).toEqual([{ id: "1" }]);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/me/agents`);
  });

  it("createAgent → POST /agents with the publish body", async () => {
    const { fetchImpl, calls } = stubFetch(
      jsonRes({ agentId: "a1", slug: "s1", shareUrl: "https://x/a/s1" }, 201),
    );
    const res = await client(fetchImpl, token).createAgent({
      ir: { irVersion: "2.0.0" } as never,
      publish: true,
    });
    expect(res).toEqual({
      agentId: "a1",
      slug: "s1",
      shareUrl: "https://x/a/s1",
    });
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/agents`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      ir: { irVersion: "2.0.0" },
      publish: true,
    });
  });

  it("patchAgent → PATCH /agents/{id} returning the agent", async () => {
    const { fetchImpl, calls } = stubFetch(
      jsonRes({ agent: { id: "a1", state: "published" } }),
    );
    const res = await client(fetchImpl, token).patchAgent("a1", {
      publish: true,
    });
    expect(res.agent.state).toBe("published");
    expect(calls[0].init.method).toBe("PATCH");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/agents/a1`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ publish: true });
  });

  it("deleteAgent → DELETE /agents/{id}", async () => {
    const { fetchImpl, calls } = stubFetch(new Response(null, { status: 204 }));
    await client(fetchImpl, token).deleteAgent("a1");
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/agents/a1`);
  });

  it("claimAgent → POST /claim with the claim body", async () => {
    const { fetchImpl, calls } = stubFetch(
      jsonRes({ agentId: "a1", slug: "s1" }),
    );
    const res = await client(fetchImpl, token).claimAgent({
      agentId: "a1",
      code: "c",
    });
    expect(res).toEqual({ agentId: "a1", slug: "s1" });
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/claim`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      agentId: "a1",
      code: "c",
    });
  });

  it("adminListQueue → GET /admin/queue, unwrapping items", async () => {
    const { fetchImpl, calls } = stubFetch(jsonRes({ items: [{ id: "q1" }] }));
    const queue = await client(fetchImpl, token).adminListQueue();
    expect(queue).toEqual([{ id: "q1" }]);
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/admin/queue`);
  });

  it("adminActOnQueueItem → POST /admin/queue/{id} with the action", async () => {
    const { fetchImpl, calls } = stubFetch(jsonRes({ ok: true }));
    await client(fetchImpl, token).adminActOnQueueItem("q1", "approve");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/admin/queue/q1`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      action: "approve",
    });
  });

  it("adminListReports → GET /admin/reports?status= when filtered", async () => {
    const { fetchImpl, calls } = stubFetch(jsonRes({ items: [{ id: "r1" }] }));
    const reports = await client(fetchImpl, token).adminListReports("open");
    expect(reports).toEqual([{ id: "r1" }]);
    expect(calls[0].url).toBe(
      `${BASE}${STORE_API_PREFIX}/admin/reports?status=open`,
    );
  });

  it("adminListReports → GET /admin/reports with no query when unfiltered", async () => {
    const { fetchImpl, calls } = stubFetch(jsonRes({ items: [] }));
    await client(fetchImpl, token).adminListReports();
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/admin/reports`);
  });

  it("adminActOnReport → POST /admin/reports/{id} with the action", async () => {
    const { fetchImpl, calls } = stubFetch(jsonRes({ ok: true }));
    await client(fetchImpl, token).adminActOnReport("r1", "dismiss");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/admin/reports/r1`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      action: "dismiss",
    });
  });

  it("adminPurge → POST /admin/purge returning the counts", async () => {
    const { fetchImpl, calls } = stubFetch(
      jsonRes({ draftsDeleted: 2, softDeletedPurged: 5 }),
    );
    const res = await client(fetchImpl, token).adminPurge();
    expect(res).toEqual({ draftsDeleted: 2, softDeletedPurged: 5 });
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}${STORE_API_PREFIX}/admin/purge`);
  });
});

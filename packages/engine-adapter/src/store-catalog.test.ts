import { describe, expect, it } from "vitest";
import {
  fetchStoreAgent,
  fetchStoreCatalog,
  fetchStoreCategories,
  fetchStoreCreator,
  pingStoreInstall,
  reportStoreAgent,
  reportStoreCreator,
  StoreCatalogError,
  storeCatalogApiBase,
} from "./store-catalog.ts";

/**
 * The public catalog reads: URL/query construction, the anonymous ping's
 * body, and the structural error (status-carrying, wire-type-free).
 * `fetchImpl` is injected, so no network is touched.
 */

const BASE = "https://gateway.example.com";

// The catalog has no hardcoded fallback host: it reads the shell-installed
// target or the build-time bake, and throws when a build supplies neither.
// Stand in for the shell so the request-shape assertions below have a base.
(globalThis as { window?: unknown }).window = {
  __HOUSTON_STORE__: { baseUrl: BASE, token: "" },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function capture(body: unknown = { items: [], hasMore: false }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(jsonResponse(body));
  }) as typeof fetch;
  return { calls, fetchImpl };
}

/**
 * What a call threw, as a value. `expect(...).rejects` can assert a shape but
 * cannot hand the error back, and every rejection below is asserted on more
 * than one of its properties.
 */
async function rejection(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to reject, but it resolved");
}

describe("storeCatalogApiBase", () => {
  it("uses the target the shell installed", () => {
    expect(storeCatalogApiBase()).toBe(BASE);
  });

  it("trims a trailing slash off the installed target", () => {
    const win = (globalThis as { window: { __HOUSTON_STORE__: unknown } })
      .window;
    const restore = win.__HOUSTON_STORE__;
    win.__HOUSTON_STORE__ = { baseUrl: `${BASE}/`, token: "" };
    try {
      expect(storeCatalogApiBase()).toBe(BASE);
    } finally {
      win.__HOUSTON_STORE__ = restore;
    }
  });

  // No hardcoded production host to fall back on: a build that was given no
  // store target has no store, loudly. A literal here would silently override
  // whatever the environment meant, which is how the staging QA DMG spent
  // releases publishing into the production catalog.
  it("throws when the build configured no store gateway", () => {
    const win = (globalThis as { window: { __HOUSTON_STORE__: unknown } })
      .window;
    const restore = win.__HOUSTON_STORE__;
    win.__HOUSTON_STORE__ = undefined;
    try {
      let caught: unknown;
      try {
        storeCatalogApiBase();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(StoreCatalogError);
      expect((caught as StoreCatalogError).status).toBe(0);
    } finally {
      win.__HOUSTON_STORE__ = restore;
    }
  });
});

describe("fetchStoreCatalog", () => {
  it("requests the bare listing when the query is empty", async () => {
    const { calls, fetchImpl } = capture();
    await fetchStoreCatalog({}, fetchImpl);
    expect(calls[0].url).toBe(`${BASE}/v1/agentstore/agents`);
  });

  it("carries q/category/sort and omits page 1", async () => {
    const { calls, fetchImpl } = capture();
    await fetchStoreCatalog(
      {
        q: "  email helper ",
        category: "productivity",
        sort: "installs",
        page: 1,
      },
      fetchImpl,
    );
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("q")).toBe("email helper");
    expect(url.searchParams.get("category")).toBe("productivity");
    expect(url.searchParams.get("sort")).toBe("installs");
    expect(url.searchParams.get("page")).toBe(null);
  });

  it("carries pages past the first", async () => {
    const { calls, fetchImpl } = capture();
    await fetchStoreCatalog({ page: 3 }, fetchImpl);
    expect(new URL(calls[0].url).searchParams.get("page")).toBe("3");
  });

  // Relayed verbatim except for the client's own backfill of additive summary
  // fields (`normalizeAgentSummary`), so a page served by an older gateway
  // still reaches the UI with every field it renders.
  it("returns the page payload, with absent summary fields backfilled", async () => {
    const { fetchImpl } = capture({ items: [{ id: "a1" }], hasMore: true });
    expect(await fetchStoreCatalog({}, fetchImpl)).toEqual({
      items: [{ id: "a1", skills: [] }],
      hasMore: true,
    });
  });

  it("throws a status-carrying StoreCatalogError on a failed read", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        jsonResponse({ error: "not_found" }, 404),
      )) as typeof fetch;
    const error = await rejection(fetchStoreCatalog({}, fetchImpl));
    expect(error).toBeInstanceOf(StoreCatalogError);
    expect((error as StoreCatalogError).status).toBe(404);
    expect(typeof (error as StoreCatalogError).body).toBe("object");
  });

  it("re-raises the underlying cause on a network failure (status 0)", async () => {
    // A thrown fetch surfaces as a status-0 StoreApiError carrying the original
    // cause; that cause must propagate unchanged (never wrapped as a
    // StoreCatalogError), exactly as the former plain-fetch code let it bubble.
    const cause = new Error("connection refused");
    const fetchImpl = (() => Promise.reject(cause)) as typeof fetch;
    expect(await rejection(fetchStoreCatalog({}, fetchImpl))).toBe(cause);
  });
});

describe("fetchStoreAgent", () => {
  it("addresses the listing by encoded slug", async () => {
    const { calls, fetchImpl } = capture({ agent: {}, ir: {} });
    await fetchStoreAgent("inbox-helper", fetchImpl);
    expect(calls[0].url).toBe(`${BASE}/v1/agentstore/agents/inbox-helper`);
  });
});

describe("fetchStoreCategories", () => {
  it("GETs /categories and unwraps the items array", async () => {
    const cats = [
      { slug: "productivity", name: "Productivity" },
      { slug: "research", name: "Research" },
    ];
    const { calls, fetchImpl } = capture({ items: cats });
    expect(await fetchStoreCategories(fetchImpl)).toEqual(cats);
    expect(calls[0].url).toBe(`${BASE}/v1/agentstore/categories`);
  });

  it("throws a status-carrying StoreCatalogError on a failed read", async () => {
    const fetchImpl = (() =>
      Promise.resolve(jsonResponse({ error: "boom" }, 500))) as typeof fetch;
    const error = await rejection(fetchStoreCategories(fetchImpl));
    expect(error).toBeInstanceOf(StoreCatalogError);
    expect((error as StoreCatalogError).status).toBe(500);
  });

  it("re-raises the underlying cause on a network failure (status 0)", async () => {
    const cause = new Error("connection refused");
    const fetchImpl = (() => Promise.reject(cause)) as typeof fetch;
    expect(await rejection(fetchStoreCategories(fetchImpl))).toBe(cause);
  });
});

describe("reportStoreAgent", () => {
  it("POSTs the report body to the agent's reports route", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response(null, { status: 201 }));
    }) as typeof fetch;
    await reportStoreAgent(
      "inbox-helper",
      { reason: "spam", details: "unsolicited" },
      fetchImpl,
    );
    expect(calls[0].url).toBe(
      `${BASE}/v1/agentstore/agents/inbox-helper/reports`,
    );
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      reason: "spam",
      details: "unsolicited",
    });
  });

  it("throws a status-carrying StoreCatalogError on HTTP error", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        jsonResponse({ error: "rate_limited" }, 429),
      )) as typeof fetch;
    const error = await rejection(
      reportStoreAgent("inbox-helper", { reason: "other" }, fetchImpl),
    );
    expect(error).toBeInstanceOf(StoreCatalogError);
    expect((error as StoreCatalogError).status).toBe(429);
  });

  it("re-raises the underlying cause on a network failure (status 0)", async () => {
    const cause = new Error("connection refused");
    const fetchImpl = (() => Promise.reject(cause)) as typeof fetch;
    expect(
      await rejection(
        reportStoreAgent("inbox-helper", { reason: "spam" }, fetchImpl),
      ),
    ).toBe(cause);
  });
});

describe("fetchStoreCreator", () => {
  it("GETs the creator page, carrying sort and pages past the first", async () => {
    const { calls, fetchImpl } = capture({
      profile: { handle: "felipe" },
      agents: { items: [], hasMore: false },
    });
    await fetchStoreCreator("felipe", { sort: "installs", page: 2 }, fetchImpl);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v1/agentstore/creators/felipe");
    expect(url.searchParams.get("sort")).toBe("installs");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("omits page=1 and percent-encodes the handle", async () => {
    const { calls, fetchImpl } = capture({
      profile: { handle: "a/b" },
      agents: { items: [], hasMore: false },
    });
    await fetchStoreCreator("a/b", { page: 1 }, fetchImpl);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v1/agentstore/creators/a%2Fb");
    expect(url.searchParams.get("page")).toBe(null);
  });

  it("returns the creator page payload, with absent summary fields backfilled", async () => {
    const { fetchImpl } = capture({
      profile: { handle: "felipe" },
      agents: { items: [{ id: "a1" }], hasMore: true },
    });
    expect(await fetchStoreCreator("felipe", {}, fetchImpl)).toEqual({
      profile: { handle: "felipe" },
      agents: { items: [{ id: "a1", skills: [] }], hasMore: true },
    });
  });

  it("throws a status-carrying StoreCatalogError on a 404", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        jsonResponse({ error: "not_found" }, 404),
      )) as typeof fetch;
    const error = await rejection(fetchStoreCreator("ghost", {}, fetchImpl));
    expect(error).toBeInstanceOf(StoreCatalogError);
    expect((error as StoreCatalogError).status).toBe(404);
  });

  it("re-raises the underlying cause on a network failure (status 0)", async () => {
    const cause = new Error("connection refused");
    const fetchImpl = (() => Promise.reject(cause)) as typeof fetch;
    expect(await rejection(fetchStoreCreator("felipe", {}, fetchImpl))).toBe(
      cause,
    );
  });
});

describe("reportStoreCreator", () => {
  it("POSTs the report body to the creator's reports route", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response(null, { status: 201 }));
    }) as typeof fetch;
    await reportStoreCreator(
      "felipe",
      { reason: "spam", details: "impersonation" },
      fetchImpl,
    );
    expect(calls[0].url).toBe(`${BASE}/v1/agentstore/creators/felipe/reports`);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      reason: "spam",
      details: "impersonation",
    });
  });

  it("throws a status-carrying StoreCatalogError on HTTP error", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        jsonResponse({ error: "rate_limited" }, 429),
      )) as typeof fetch;
    const error = await rejection(
      reportStoreCreator("felipe", { reason: "other" }, fetchImpl),
    );
    expect(error).toBeInstanceOf(StoreCatalogError);
    expect((error as StoreCatalogError).status).toBe(429);
  });

  it("re-raises the underlying cause on a network failure (status 0)", async () => {
    const cause = new Error("connection refused");
    const fetchImpl = (() => Promise.reject(cause)) as typeof fetch;
    expect(
      await rejection(
        reportStoreCreator("felipe", { reason: "spam" }, fetchImpl),
      ),
    ).toBe(cause);
  });
});

describe("pingStoreInstall", () => {
  it("POSTs the houston install target", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;
    await pingStoreInstall("inbox-helper", fetchImpl);
    expect(calls[0].url).toBe(
      `${BASE}/v1/agentstore/agents/inbox-helper/installs`,
    );
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      target: "houston",
    });
  });

  it("throws on a rejected ping so the caller can report it", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        jsonResponse({ error: "not_found" }, 404),
      )) as typeof fetch;
    const error = await rejection(pingStoreInstall("ghost", fetchImpl));
    expect(error).toBeInstanceOf(StoreCatalogError);
    expect((error as StoreCatalogError).status).toBe(404);
  });
});

import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  fetchStoreAgent,
  fetchStoreCatalog,
  pingStoreInstall,
  StoreCatalogError,
  storeCatalogApiBase,
} from "../src/store-catalog.ts";

/**
 * The public catalog reads: URL/query construction, the anonymous ping's
 * body, and the structural error (status-carrying, engine-client-free).
 * `fetchImpl` is injected, so no network is touched.
 */

const BASE = "https://gateway.gethouston.ai";

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

describe("storeCatalogApiBase", () => {
  it("defaults to the production gateway outside a browser build", () => {
    strictEqual(storeCatalogApiBase(), BASE);
  });
});

describe("fetchStoreCatalog", () => {
  it("requests the bare listing when the query is empty", async () => {
    const { calls, fetchImpl } = capture();
    await fetchStoreCatalog({}, fetchImpl);
    strictEqual(calls[0].url, `${BASE}/v1/agentstore/agents`);
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
    strictEqual(url.searchParams.get("q"), "email helper");
    strictEqual(url.searchParams.get("category"), "productivity");
    strictEqual(url.searchParams.get("sort"), "installs");
    strictEqual(url.searchParams.get("page"), null);
  });

  it("carries pages past the first", async () => {
    const { calls, fetchImpl } = capture();
    await fetchStoreCatalog({ page: 3 }, fetchImpl);
    strictEqual(new URL(calls[0].url).searchParams.get("page"), "3");
  });

  it("returns the page payload as-is", async () => {
    const page = { items: [{ id: "a1" }], hasMore: true };
    const { fetchImpl } = capture(page);
    deepStrictEqual(await fetchStoreCatalog({}, fetchImpl), page);
  });

  it("throws a status-carrying StoreCatalogError on a failed read", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        jsonResponse({ error: "not_found" }, 404),
      )) as typeof fetch;
    await rejects(
      fetchStoreCatalog({}, fetchImpl),
      (err: unknown) =>
        err instanceof StoreCatalogError &&
        err.status === 404 &&
        typeof err.body === "object",
    );
  });
});

describe("fetchStoreAgent", () => {
  it("addresses the listing by encoded slug", async () => {
    const { calls, fetchImpl } = capture({ agent: {}, ir: {} });
    await fetchStoreAgent("inbox-helper", fetchImpl);
    strictEqual(calls[0].url, `${BASE}/v1/agentstore/agents/inbox-helper`);
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
    strictEqual(
      calls[0].url,
      `${BASE}/v1/agentstore/agents/inbox-helper/installs`,
    );
    strictEqual(calls[0].init?.method, "POST");
    deepStrictEqual(JSON.parse(String(calls[0].init?.body)), {
      target: "houston",
    });
  });

  it("throws on a rejected ping so the caller can report it", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        jsonResponse({ error: "not_found" }, 404),
      )) as typeof fetch;
    await rejects(pingStoreInstall("ghost", fetchImpl), (err: unknown) => {
      ok(err instanceof StoreCatalogError);
      strictEqual(err.status, 404);
      return true;
    });
  });
});

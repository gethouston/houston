import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAgentBySlug,
  getAgentIr,
  listAgents,
  listAllPublicSlugs,
  listCategories,
  recordInstall,
} from "./store-api";
import { StoreApiError } from "./store-api-types";

/** A JSON `Response` factory. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  process.env.AGENTSTORE_GATEWAY_URL = "https://gw.test";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AGENTSTORE_GATEWAY_URL;
});

/** The absolute URL string of the Nth fetch call. */
function calledUrl(n = 0): string {
  const input = fetchMock.mock.calls[n]?.[0];
  return typeof input === "string" ? input : String(input);
}

describe("listAgents", () => {
  it("builds a query from the params and revalidates 60s", async () => {
    fetchMock.mockResolvedValue(json({ items: [], hasMore: false }));
    await listAgents({
      q: "inbox triage",
      category: "productivity",
      integration: "gmail",
      sort: "installs",
      page: 3,
    });
    const url = new URL(calledUrl());
    expect(url.pathname).toBe("/v1/agentstore/agents");
    expect(url.searchParams.get("q")).toBe("inbox triage");
    expect(url.searchParams.get("category")).toBe("productivity");
    expect(url.searchParams.get("integration")).toBe("GMAIL");
    expect(url.searchParams.get("sort")).toBe("installs");
    expect(url.searchParams.get("page")).toBe("3");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & {
      next?: { revalidate?: number };
    };
    expect(init.next?.revalidate).toBe(60);
  });

  it("omits default params (recent sort, page 1)", async () => {
    fetchMock.mockResolvedValue(json({ items: [], hasMore: false }));
    await listAgents({ sort: "recent", page: 1 });
    const url = new URL(calledUrl());
    expect(url.search).toBe("");
  });

  it("throws a StoreApiError on a non-OK response", async () => {
    fetchMock.mockResolvedValue(json({ error: "boom" }, 503));
    await expect(listAgents({})).rejects.toBeInstanceOf(StoreApiError);
  });
});

describe("listCategories", () => {
  it("unwraps the items array", async () => {
    fetchMock.mockResolvedValue(
      json({ items: [{ slug: "writing", name: "Writing" }] }),
    );
    expect(await listCategories()).toEqual([
      { slug: "writing", name: "Writing" },
    ]);
  });
});

describe("getAgentBySlug", () => {
  it("returns null for a blank slug without fetching", async () => {
    expect(await getAgentBySlug("   ")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on 404", async () => {
    fetchMock.mockResolvedValue(json({ error: "not_found" }, 404));
    expect(await getAgentBySlug("ghost")).toBeNull();
  });

  it("throws on a non-404 failure", async () => {
    fetchMock.mockResolvedValue(json({ error: "down" }, 500));
    await expect(getAgentBySlug("x")).rejects.toBeInstanceOf(StoreApiError);
  });

  it("returns the detail payload on success", async () => {
    const detail = { agent: { id: "a1" }, ir: { irVersion: "2.0.0" } };
    fetchMock.mockResolvedValue(json(detail));
    expect(await getAgentBySlug("good")).toEqual(detail);
    expect(new URL(calledUrl()).pathname).toBe("/v1/agentstore/agents/good");
  });
});

describe("getAgentIr", () => {
  it("unwraps the ir from the detail, null on 404", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ agent: {}, ir: { irVersion: "2.0.0" } }),
    );
    expect(await getAgentIr("s")).toEqual({ irVersion: "2.0.0" });
    fetchMock.mockResolvedValueOnce(json({ error: "not_found" }, 404));
    expect(await getAgentIr("s")).toBeNull();
  });
});

describe("recordInstall", () => {
  it("POSTs the target and forwards the client IP", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await recordInstall("agent-x", "claude_skill_zip", { clientIp: "9.9.9.9" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      target: "claude_skill_zip",
    });
    const headers = init.headers as Record<string, string>;
    expect(headers["x-forwarded-for"]).toBe("9.9.9.9");
    expect(new URL(calledUrl()).pathname).toBe(
      "/v1/agentstore/agents/agent-x/installs",
    );
  });

  it("throws when the gateway rejects the install", async () => {
    fetchMock.mockResolvedValue(json({ error: "rate_limited" }, 429));
    await expect(recordInstall("a", "copy_paste")).rejects.toBeInstanceOf(
      StoreApiError,
    );
  });
});

describe("listAllPublicSlugs", () => {
  it("walks pages until hasMore is false", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ items: [{ slug: "a" }, { slug: "b" }], hasMore: true }),
      )
      .mockResolvedValueOnce(json({ items: [{ slug: "c" }], hasMore: false }));
    expect(await listAllPublicSlugs()).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips null slugs", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ items: [{ slug: null }, { slug: "kept" }], hasMore: false }),
    );
    expect(await listAllPublicSlugs()).toEqual(["kept"]);
  });
});

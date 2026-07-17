import { StoreApiError } from "@houston/agentstore-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimAgent,
  deleteAgent,
  listMyAgents,
  patchAgent,
  reportAgent,
} from "./store-client";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  process.env.NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL = "https://gw.test";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL;
});

function lastInit(): RequestInit {
  const call = fetchMock.mock.calls.at(-1);
  return (call?.[1] ?? {}) as RequestInit;
}

function lastHeaders(): Headers {
  return new Headers(lastInit().headers);
}

describe("listMyAgents", () => {
  it("sends the bearer and unwraps items", async () => {
    fetchMock.mockResolvedValue(json({ items: [{ id: "a" }] }));
    const agents = await listMyAgents("tok123");
    expect(agents).toEqual([{ id: "a" }]);
    expect(lastHeaders().get("authorization")).toBe("Bearer tok123");
    expect(lastInit().cache).toBe("no-store");
  });

  it("maps a 401 to StoreApiError", async () => {
    fetchMock.mockResolvedValue(json({ error: "unauthorized" }, 401));
    await expect(listMyAgents("bad")).rejects.toMatchObject({ status: 401 });
  });
});

describe("patchAgent", () => {
  it("PATCHes the intent with a JSON content-type", async () => {
    fetchMock.mockResolvedValue(json({ agent: { id: "id-1" } }));
    await patchAgent("t", "id-1", { publish: true });
    expect(lastInit().method).toBe("PATCH");
    expect(lastHeaders().get("content-type")).toBe("application/json");
    expect(JSON.parse(lastInit().body as string)).toEqual({ publish: true });
  });

  it("surfaces a 409 version_conflict", async () => {
    fetchMock.mockResolvedValue(
      json({ error: "version_conflict", code: "version_conflict" }, 409),
    );
    await expect(
      patchAgent("t", "id", { publish: true }),
    ).rejects.toMatchObject({ status: 409, code: "version_conflict" });
  });
});

describe("deleteAgent", () => {
  it("issues a DELETE with the bearer", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await deleteAgent("t", "id-9");
    expect(lastInit().method).toBe("DELETE");
    expect(lastHeaders().get("authorization")).toBe("Bearer t");
  });
});

describe("claimAgent", () => {
  it("returns the claim result", async () => {
    fetchMock.mockResolvedValue(json({ agentId: "a", slug: "s" }));
    expect(await claimAgent("t", { agentId: "a", code: "c" })).toEqual({
      agentId: "a",
      slug: "s",
    });
  });

  it("raises a 409 as StoreApiError", async () => {
    fetchMock.mockResolvedValue(
      json({ error: "already_claimed", code: "already_claimed" }, 409),
    );
    await expect(
      claimAgent("t", { agentId: "a", code: "c" }),
    ).rejects.toBeInstanceOf(StoreApiError);
  });
});

describe("reportAgent", () => {
  it("POSTs anonymously (no authorization header)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));
    await reportAgent("slug-x", { reason: "spam", details: "bad" });
    expect(lastHeaders().has("authorization")).toBe(false);
    expect(JSON.parse(lastInit().body as string)).toEqual({
      reason: "spam",
      details: "bad",
    });
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(
      "/v1/agentstore/agents/slug-x/reports",
    );
  });

  it("maps a rate limit to StoreApiError", async () => {
    fetchMock.mockResolvedValue(json({ error: "rate_limited" }, 429));
    await expect(reportAgent("s", { reason: "other" })).rejects.toMatchObject({
      status: 429,
    });
  });
});

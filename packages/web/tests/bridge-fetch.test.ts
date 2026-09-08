import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bridgeTokenSubject,
  scopedBridgeFetch,
} from "../src/engine-adapter/cp/bridge-fetch";

const refresh = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
vi.mock("../src/engine-adapter/session-refresh", () => ({
  refreshLiveToken: refresh,
  hasSessionRefresher: () => true,
}));

const token = (sub: string, exp = 1) =>
  `header.${btoa(JSON.stringify({ sub, exp }))}.signature`;
const config = () => ({
  baseUrl: "https://gateway.example",
  token: token("owner"),
  activeOrgSlug: "space-a",
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("identity-scoped bridge management", () => {
  it("rejects malformed subjects without exposing token contents", () => {
    expect(bridgeTokenSubject("invalid-secret")).toBeNull();
    expect(bridgeTokenSubject(`x.${btoa('{"sub":32}')}.y`)).toBeNull();
    expect(bridgeTokenSubject(token("owner"))).toBe("owner");
  });

  it("sends the captured workspace and current owner token", async () => {
    const cfg = config();
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await scopedBridgeFetch(cfg, "owner")("/v1/local-model-bridges", {
      method: "POST",
      body: "{}",
    });
    const headers = new Headers(fetch.mock.calls[0]?.[1].headers);
    expect(headers.get("x-houston-org")).toBe("space-a");
    expect(headers.get("Authorization")).toBe(`Bearer ${cfg.token}`);
  });

  it("does not send a delayed request after a workspace switch", async () => {
    const cfg = config();
    const request = scopedBridgeFetch(cfg, "owner");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    cfg.activeOrgSlug = "space-b";
    await expect(request("/v1/local-model-bridges")).rejects.toMatchObject({
      status: 409,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not replay a mutation with another account's refreshed token", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    refresh.mockResolvedValue(token("someone-else", 2));
    await expect(
      scopedBridgeFetch(config(), "owner")("/v1/local-model-bridges", {
        method: "POST",
        body: "{}",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("renews transparently when the refreshed token belongs to the same owner", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    refresh.mockResolvedValue(token("owner", 2));
    await scopedBridgeFetch(config(), "owner")("/v1/local-model-bridges");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects deployment changes before sending a device secret", async () => {
    const cfg = config();
    const request = scopedBridgeFetch(cfg, "owner");
    cfg.baseUrl = "https://other.example";
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(request("/v1/local-model-bridges")).rejects.toMatchObject({
      status: 409,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

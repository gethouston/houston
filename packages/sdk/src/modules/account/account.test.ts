import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { AccountCommand, AccountHttpError } from "./index";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

/**
 * An inert SDK (`reactivity:false`) over a mock `fetch` that records the whole
 * request and answers whatever the test queues. The account routes are
 * gateway-only, so every assertion here is about the exact URL, method and body
 * bytes that reach the wire — and about the fact that nothing is swallowed.
 */
function makeSdk(respond: (url: string) => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: (init?.method ?? "GET").toUpperCase(),
        url: String(input),
        body: typeof init?.body === "string" ? init.body : null,
      });
      return respond(String(input));
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

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const PROFILE = {
  displayName: "Ada",
  custom: { displayName: true, photoUrl: false },
};

describe("account module — the caller's own profile", () => {
  it("reads the effective profile off /v1/me/profile", async () => {
    const { sdk, calls } = makeSdk(() => json(PROFILE));

    await expect(sdk.account.getMyProfile()).resolves.toEqual(PROFILE);

    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/me/profile`, body: null },
    ]);
  });

  it("sends ONLY the keys the caller set, so an omitted field stays untouched", async () => {
    const { sdk, calls } = makeSdk(() => json(PROFILE));

    await sdk.account.setMyProfile({ displayName: "Ada" });

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toBe(JSON.stringify({ displayName: "Ada" }));
  });

  it("keeps a null apart from an absent key — clearing is not skipping", async () => {
    const { sdk, calls } = makeSdk(() => json(PROFILE));

    await sdk.account.setMyProfile({ photoUrl: null });

    expect(calls[0].body).toBe(JSON.stringify({ photoUrl: null }));
  });

  it("throws a status-bearing error on a 404 — the caller owns the degrade", async () => {
    const { sdk } = makeSdk(() => json({ error: "not found" }, 404));

    await expect(sdk.account.getMyProfile()).rejects.toMatchObject({
      name: "AccountHttpError",
      status: 404,
    });
  });

  it("carries the host's reason on a failed write, verbatim", async () => {
    const { sdk } = makeSdk(() => json({ error: "name too long" }, 400));

    const err = await sdk.account
      .setMyProfile({ displayName: "x" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(AccountHttpError);
    expect(err.status).toBe(400);
    expect(err.message).toBe(JSON.stringify({ error: "name too long" }));
  });
});

describe("account module — personal API keys", () => {
  it("unwraps the key list off /v1/keys", async () => {
    const keys = [
      { id: "k1", name: "ci", prefix: "hst_ab", createdAt: "2026-01-01" },
    ];
    const { sdk, calls } = makeSdk(() => json({ keys }));

    await expect(sdk.account.listApiKeys()).resolves.toEqual(keys);

    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/keys`, body: null },
    ]);
  });

  it("mints a key with the name as the whole body", async () => {
    const { sdk, calls } = makeSdk(() =>
      json({
        id: "k2",
        name: "ci",
        prefix: "hst_cd",
        createdAt: "x",
        key: "hst_secret",
      }),
    );

    await expect(sdk.account.createApiKey("ci")).resolves.toMatchObject({
      key: "hst_secret",
    });

    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/v1/keys`);
    expect(calls[0].body).toBe(JSON.stringify({ name: "ci" }));
  });

  it("percent-encodes the key id into the revoke path", async () => {
    const { sdk, calls } = makeSdk(() => new Response(null, { status: 204 }));

    await sdk.account.revokeApiKey("k 1/2");

    expect(calls).toEqual([
      { method: "DELETE", url: `${BASE}/v1/keys/k%201%2F2`, body: null },
    ]);
  });

  it("surfaces the key-limit 400 instead of resolving empty", async () => {
    const { sdk } = makeSdk(() => json({ code: "key_limit" }, 400));

    await expect(sdk.account.createApiKey("ci")).rejects.toBeInstanceOf(
      AccountHttpError,
    );
  });
});

describe("account module — the dispatch path", () => {
  it("dispatches the same writes the facade calls", async () => {
    const { sdk, calls } = makeSdk(() => json(PROFILE));

    const result = await sdk.dispatch({
      id: "1",
      type: AccountCommand.SetProfile,
      payload: { update: { displayName: "Ada", photoUrl: null } },
    });

    expect(result.ok).toBe(true);
    expect(calls[0].body).toBe(
      JSON.stringify({ displayName: "Ada", photoUrl: null }),
    );
  });

  it("refuses a payload that is not a profile update", async () => {
    const { sdk, calls } = makeSdk(() => json(PROFILE));

    const result = await sdk.dispatch({
      id: "1",
      type: AccountCommand.SetProfile,
      payload: { update: { displayName: 7 } },
    });

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

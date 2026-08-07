import { describe, expect, it } from "vitest";
import {
  bundleOf,
  type CustomOAuthBundle,
  parseBundle,
  resolveOAuthValue,
} from "./oauth-bundle";
import { MemoryCustomSecretStore } from "./secrets";

const AS = "https://auth.example.com";

const METADATA = {
  issuer: AS,
  authorization_endpoint: `${AS}/authorize`,
  token_endpoint: `${AS}/token`,
  response_types_supported: ["code"],
};

function bundle(over: Partial<CustomOAuthBundle> = {}): CustomOAuthBundle {
  return {
    kind: "houston-custom-oauth",
    version: 1,
    authorizationServerUrl: AS,
    metadata: METADATA,
    client: { client_id: "cid", redirect_uris: ["http://127.0.0.1:1/cb"] },
    tokens: {
      access_token: "at-old",
      token_type: "Bearer",
      refresh_token: "rt-1",
    },
    expiresAt: Date.now() + 3_600_000,
    ...over,
  };
}

const refreshServer = (calls: URLSearchParams[]) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe(`${AS}/token`);
    const params = new URLSearchParams(
      typeof init?.body === "string"
        ? init.body
        : (init?.body as URLSearchParams).toString(),
    );
    calls.push(params);
    return new Response(
      JSON.stringify({
        access_token: "at-new",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "rt-2",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

describe("parseBundle", () => {
  it("recognizes a bundle and rejects plain keys", () => {
    expect(parseBundle(JSON.stringify(bundle()))).not.toBeNull();
    expect(parseBundle("sk-plain-api-key")).toBeNull();
    expect(parseBundle(JSON.stringify({ some: "json" }))).toBeNull();
  });
});

describe("bundleOf", () => {
  it("computes expiry from expires_in and null without one", () => {
    const withExpiry = bundleOf({
      authorizationServerUrl: AS,
      client: { client_id: "c", redirect_uris: ["http://127.0.0.1:1/cb"] },
      tokens: { access_token: "a", token_type: "Bearer", expires_in: 60 },
    });
    expect(withExpiry.expiresAt).toBeGreaterThan(Date.now());
    const withoutExpiry = bundleOf({
      authorizationServerUrl: AS,
      client: { client_id: "c", redirect_uris: ["http://127.0.0.1:1/cb"] },
      tokens: { access_token: "a", token_type: "Bearer" },
    });
    expect(withoutExpiry.expiresAt).toBeNull();
  });
});

describe("resolveOAuthValue", () => {
  it("serves a fresh access token without touching the network", async () => {
    const store = new MemoryCustomSecretStore();
    const fresh = bundle();
    const failing = (async () => {
      throw new Error("no network expected");
    }) as typeof fetch;
    await expect(
      resolveOAuthValue(
        store,
        "id-fresh",
        JSON.stringify(fresh),
        fresh,
        failing,
      ),
    ).resolves.toBe("at-old");
  });

  it("refreshes an expired token and persists the rotated bundle", async () => {
    const store = new MemoryCustomSecretStore();
    const stale = bundle({ expiresAt: Date.now() - 1 });
    const raw = JSON.stringify(stale);
    await store.set("id-stale", raw);
    const calls: URLSearchParams[] = [];
    await expect(
      resolveOAuthValue(store, "id-stale", raw, stale, refreshServer(calls)),
    ).resolves.toBe("at-new");
    expect(calls[0]?.get("grant_type")).toBe("refresh_token");
    expect(calls[0]?.get("refresh_token")).toBe("rt-1");
    const persisted = parseBundle((await store.get("id-stale")) ?? "");
    expect(persisted?.tokens.access_token).toBe("at-new");
    expect(persisted?.tokens.refresh_token).toBe("rt-2");
    expect(persisted?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("a refresh never persists over a write that landed mid-flight (CAS)", async () => {
    const store = new MemoryCustomSecretStore();
    const stale = bundle({ expiresAt: Date.now() - 1 });
    const raw = JSON.stringify(stale);
    // A new grant (or a delete) already replaced the stored value.
    await store.set("id-cas", "the-newer-grant");
    const calls: URLSearchParams[] = [];
    await expect(
      resolveOAuthValue(store, "id-cas", raw, stale, refreshServer(calls)),
    ).resolves.toBe("at-new");
    expect(await store.get("id-cas")).toBe("the-newer-grant");
  });

  it("an expired grant with no refresh token asks for a new sign-in", async () => {
    const store = new MemoryCustomSecretStore();
    const dead = bundle({
      expiresAt: Date.now() - 1,
      tokens: { access_token: "at", token_type: "Bearer" },
    });
    await expect(
      resolveOAuthValue(store, "id-dead", JSON.stringify(dead), dead),
    ).rejects.toThrow(/sign in again/);
  });
});

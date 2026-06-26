import { expect, test } from "bun:test";
import { isApiKeyCredential, type WorkspaceCredential } from "../ports";
import { isExpiring, refreshCredential } from "./refresh";

/**
 * The connect-once refresher is OAuth-only. An API-key credential (OpenCode Zen /
 * Go) never expires and has nothing to rotate, so it must be treated as a no-op
 * by both the expiry check and the refresh — a stray OAuth token call against a
 * pasted key would 4xx and break every turn.
 */

const apiKey: WorkspaceCredential = {
  workspaceId: "ws_1",
  provider: "opencode",
  accessToken: "sk-opencode-zen",
  refreshToken: "",
  expiresAt: 0,
  kind: "api_key",
};

test("isApiKeyCredential recognises both the kind tag and the expiresAt=0 sentinel", () => {
  expect(isApiKeyCredential(apiKey)).toBe(true);
  expect(isApiKeyCredential({ ...apiKey, kind: undefined })).toBe(true); // sentinel alone
  expect(
    isApiKeyCredential({
      workspaceId: "ws_1",
      provider: "openai-codex",
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: 1_900_000_000_000,
    }),
  ).toBe(false);
});

test("isExpiring is false for an api-key credential (never expires)", () => {
  expect(isExpiring(apiKey)).toBe(false);
});

test("refreshCredential returns an api-key credential unchanged (no OAuth call)", async () => {
  expect(await refreshCredential(apiKey)).toEqual(apiKey);
});

test("isExpiring is true for an already-expired oauth token", () => {
  expect(
    isExpiring({
      workspaceId: "ws_1",
      provider: "openai-codex",
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: 1, // long past
    }),
  ).toBe(true);
});

test("refreshCredential mints a fresh GitHub Copilot token from the stored GitHub token", async () => {
  // Copilot's refresh is NOT a standard `grant_type=refresh_token` POST: pi-ai
  // GETs GitHub's Copilot token endpoint with the long-lived GitHub OAuth token
  // (stored as `refreshToken`) and gets a short-lived Copilot token back. Stub
  // that single call so the test stays offline. Without the provider branch this
  // would throw "no OAuth refresh config" and every Copilot turn would 401.
  const realFetch = globalThis.fetch;
  const expiresAtSec = Math.floor(Date.now() / 1000) + 1500; // ~25 min out
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("copilot_internal/v2/token")) {
      return new Response(
        JSON.stringify({
          token: "tid=fresh-copilot-token",
          expires_at: expiresAtSec,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch in test: ${u}`);
  }) as typeof fetch;
  try {
    const fresh = await refreshCredential({
      workspaceId: "ws_1",
      provider: "github-copilot",
      accessToken: "tid=stale",
      refreshToken: "gho_github_token", // the long-lived GitHub token
      expiresAt: 1, // expired -> must refresh
      kind: "oauth",
    });
    expect(fresh.accessToken).toBe("tid=fresh-copilot-token");
    // The GitHub token is long-lived and comes back unchanged.
    expect(fresh.refreshToken).toBe("gho_github_token");
    // pi-ai applies a 5-min safety skew to the Copilot token's expires_at.
    expect(fresh.expiresAt).toBe(expiresAtSec * 1000 - 5 * 60 * 1000);
    // Still OAuth (not an API key) so isExpiring/refresh keep driving it.
    expect(isApiKeyCredential(fresh)).toBe(false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("refreshCredential refreshes Copilot Enterprise against the company GitHub and preserves the domain", async () => {
  // For GitHub Copilot Enterprise, `enterpriseUrl` (the company GitHub domain)
  // must route the refresh at `api.<domain>/copilot_internal/v2/token` — NOT
  // github.com — or the company's short-lived Copilot token can never be minted.
  const realFetch = globalThis.fetch;
  const expiresAtSec = Math.floor(Date.now() / 1000) + 1500;
  let hitUrl = "";
  globalThis.fetch = (async (url: string | URL | Request) => {
    hitUrl = String(url);
    if (hitUrl.includes("copilot_internal/v2/token")) {
      return new Response(
        JSON.stringify({ token: "tid=ghe-token", expires_at: expiresAtSec }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch in test: ${hitUrl}`);
  }) as typeof fetch;
  try {
    const fresh = await refreshCredential({
      workspaceId: "ws_1",
      provider: "github-copilot",
      accessToken: "tid=stale",
      refreshToken: "gho_company_token",
      expiresAt: 1,
      kind: "oauth",
      enterpriseUrl: "acme.ghe.com",
    });
    // The refresh targeted the COMPANY's GitHub API, not github.com.
    expect(hitUrl).toContain("api.acme.ghe.com/copilot_internal/v2/token");
    expect(fresh.accessToken).toBe("tid=ghe-token");
    // The domain rides along so the NEXT refresh keeps targeting the same GHE.
    expect(fresh.enterpriseUrl).toBe("acme.ghe.com");
  } finally {
    globalThis.fetch = realFetch;
  }
});

import { afterEach, expect, test, vi } from "vitest";
import { isApiKeyCredential, type WorkspaceCredential } from "../ports";
import { RefreshRejectedError } from "./oauth-token-exchange";
import { isExpiring, refreshCredential } from "./refresh";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A minimal OAuth credential for a provider present in the OAUTH map. */
const oauthCred: WorkspaceCredential = {
  workspaceId: "ws_1",
  provider: "openai-codex",
  accessToken: "at.stale",
  refreshToken: "rt",
  expiresAt: 1, // expired -> must refresh
};

const okBody = JSON.stringify({
  access_token: "at.fresh",
  refresh_token: "rt.rotated",
  expires_in: 3600,
});

/**
 * The connect-once refresher is OAuth-only. An API-key credential never expires
 * and has nothing to rotate, so it must be treated as a no-op
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

/**
 * Terminality is what disconnects a user: the serve route DELETES the
 * credential on a RefreshRejectedError. Only the OAuth server's explicit
 * verdict on the GRANT itself (`invalid_grant`, `refresh_token_invalidated`)
 * earns that. Everything else — an unattributed 400 from an edge node, an
 * `invalid_client` aimed at OUR client id, a 5xx, a 429, a dropped connection —
 * must surface as a plain Error so the route falls back to the stored token and
 * the user keeps working.
 */

/** Stub `fetch` with a queue of per-call responders. */
function stubFetch(responders: Array<() => Response | Promise<Response>>) {
  const fetchMock = vi.fn(async () => {
    const next = responders.shift();
    if (!next) throw new Error("unexpected extra fetch call");
    return await next();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const reject = (status: number, body: string) => () =>
  new Response(body, { status });

async function refreshError(opts?: Parameters<typeof refreshCredential>[1]) {
  return await refreshCredential(oauthCred, opts).then(
    () => null,
    (e: unknown) => e,
  );
}

test("a 400 invalid_grant is terminal, carries its code, and is not retried", async () => {
  const fetchMock = stubFetch([
    reject(400, JSON.stringify({ error: "invalid_grant" })),
  ]);
  const err = await refreshError();
  expect(err).toBeInstanceOf(RefreshRejectedError);
  expect((err as RefreshRejectedError).code).toBe("invalid_grant");
  expect((err as RefreshRejectedError).status).toBe(400);
  // A 4xx may already have rotated the token — retrying would spend the new one.
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a 401 invalid_client is NOT terminal: it condemns OUR client id, not the user's token", async () => {
  // RFC 6749 `invalid_client` is a verdict on the client credentials Houston
  // sends — a hardcoded public client id shared by every install. If the
  // provider ever retires it, treating this as terminal would delete EVERY
  // workspace's credential on its next refresh, with no way back.
  stubFetch([reject(401, JSON.stringify({ error: "invalid_client" }))]);
  const err = await refreshError();
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(RefreshRejectedError);
  expect((err as Error).message).toContain("invalid_client");
});

test("a 400 with a non-grant error code is NOT terminal and is not retried", async () => {
  // A transient edge-node 400 used to sign the user out permanently.
  const fetchMock = stubFetch([
    reject(400, JSON.stringify({ error: "server_error" })),
  ]);
  const err = await refreshError();
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(RefreshRejectedError);
  expect((err as Error).message).toContain("server_error"); // raw body preserved
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a 400 with an unparseable body is NOT terminal", async () => {
  const fetchMock = stubFetch([reject(400, "<html>gateway hiccup</html>")]);
  const err = await refreshError();
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(RefreshRejectedError);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a 401 refresh_token_invalidated is terminal in OpenAI's nested shape", async () => {
  // The session was ended server-side. This is the shape the serve route has
  // disconnected on since the flow shipped — the body discrimination must not
  // quietly drop it and strand the user on a token that can never work again.
  stubFetch([
    reject(
      401,
      JSON.stringify({ error: { code: "refresh_token_invalidated" } }),
    ),
  ]);
  const err = await refreshError();
  expect(err).toBeInstanceOf(RefreshRejectedError);
  expect((err as RefreshRejectedError).code).toBe("refresh_token_invalidated");
});

test("a 401 naming an unrecognised code is NOT terminal", async () => {
  stubFetch([reject(401, JSON.stringify({ error: { code: "edge_hiccup" } }))]);
  const err = await refreshError();
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(RefreshRejectedError);
});

/**
 * Retry is a ROTATION decision, not a politeness one. openai-codex rotates the
 * refresh token on use, so a retry is only safe when the first attempt provably
 * never reached the server. A timeout, an abort, a 5xx, a 429 — every one of
 * those can happen AFTER the endpoint consumed the grant and rotated it; the
 * retry then POSTs a spent token, earns `invalid_grant`, and the serve route
 * deletes the user's credential over a blip. Only pre-connection transport
 * failures (DNS, refused connection) qualify.
 */

/** An undici `TypeError: fetch failed` carrying the socket-level cause. */
const transportFailure = (code: string) => () => {
  const cause = Object.assign(
    new Error(`getaddrinfo ${code} auth.openai.com`),
    {
      code,
    },
  );
  throw new TypeError("fetch failed", { cause });
};

test("a pre-connection transport failure is retried (nothing reached the server)", async () => {
  const fetchMock = stubFetch([
    transportFailure("ENOTFOUND"),
    () => new Response(okBody, { status: 200 }),
  ]);
  const sleep = vi.fn(async (_ms: number) => {});
  const fresh = await refreshCredential(oauthCred, { sleep });
  expect(fresh.accessToken).toBe("at.fresh");
  expect(fresh.refreshToken).toBe("rt.rotated");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledTimes(1);
  expect(sleep.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(250);
  expect(sleep.mock.calls[0]?.[0]).toBeLessThanOrEqual(500);
});

test("ECONNREFUSED is retried; an ambiguous ECONNRESET is not", async () => {
  const refused = stubFetch([
    transportFailure("ECONNREFUSED"),
    () => new Response(okBody, { status: 200 }),
  ]);
  expect(
    (await refreshCredential(oauthCred, { sleep: async () => {} })).accessToken,
  ).toBe("at.fresh");
  expect(refused).toHaveBeenCalledTimes(2);

  // A reset can land after the POST was written and the grant consumed.
  const reset = stubFetch([
    transportFailure("ECONNRESET"),
    () => new Response(okBody, { status: 200 }),
  ]);
  const err = await refreshError({ sleep: async () => {} });
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(RefreshRejectedError);
  expect(reset).toHaveBeenCalledTimes(1);
});

test("a timed-out request is NOT retried: the server may already have rotated", async () => {
  // The bug this pins: attempt 1 times out AFTER the endpoint consumed the
  // rotating refresh token; attempt 2 spends the spent token, gets
  // `invalid_grant`, and the serve route deletes the user's credential.
  const fetchMock = stubFetch([
    () => {
      throw new DOMException("The operation was aborted.", "TimeoutError");
    },
    reject(400, JSON.stringify({ error: "invalid_grant" })),
  ]);
  const err = await refreshError({ sleep: async () => {} });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(RefreshRejectedError);
});

test("a 5xx is NOT retried and is not terminal", async () => {
  const fetchMock = stubFetch([
    reject(503, "upstream sad"),
    reject(400, JSON.stringify({ error: "invalid_grant" })),
  ]);
  const err = await refreshError({ sleep: async () => {} });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(RefreshRejectedError);
  expect((err as Error).message).toContain("503");
});

test("a 429 is NOT retried and is not terminal", async () => {
  const fetchMock = stubFetch([
    reject(429, "slow down"),
    reject(400, JSON.stringify({ error: "invalid_grant" })),
  ]);
  const err = await refreshError({ sleep: async () => {} });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(RefreshRejectedError);
});

test("exhausted retries surface a plain Error, never a terminal rejection", async () => {
  const fetchMock = stubFetch([
    transportFailure("EAI_AGAIN"),
    transportFailure("EAI_AGAIN"),
  ]);
  const err = await refreshError({ attempts: 2, sleep: async () => {} });
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(RefreshRejectedError);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("the token request carries an abort signal so a hung endpoint can't stall a serve", async () => {
  const fetchMock = vi.fn(
    async (_url: unknown, init?: RequestInit) =>
      new Response(okBody, {
        status: init?.signal instanceof AbortSignal ? 200 : 418,
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const fresh = await refreshCredential(oauthCred);
  expect(fresh.accessToken).toBe("at.fresh");
});

test("refreshCredential mints a fresh GitHub Copilot token from the stored GitHub token", async () => {
  // Copilot's refresh is NOT a standard `grant_type=refresh_token` POST: pi-ai
  // GETs GitHub's Copilot token endpoint with the long-lived GitHub OAuth token
  // (stored as `refreshToken`) and gets a short-lived Copilot token back, then
  // lists `<copilot api>/models` to learn the account's selectable model ids.
  // Stub both calls so the test stays offline. Without the provider branch this
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
    if (u.endsWith("/models")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
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
  let tokenUrl = "";
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("copilot_internal/v2/token")) {
      tokenUrl = u;
      return new Response(
        JSON.stringify({ token: "tid=ghe-token", expires_at: expiresAtSec }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (u.endsWith("/models")) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch in test: ${u}`);
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
    expect(tokenUrl).toContain("api.acme.ghe.com/copilot_internal/v2/token");
    expect(fresh.accessToken).toBe("tid=ghe-token");
    // The domain rides along so the NEXT refresh keeps targeting the same GHE.
    expect(fresh.enterpriseUrl).toBe("acme.ghe.com");
  } finally {
    globalThis.fetch = realFetch;
  }
});

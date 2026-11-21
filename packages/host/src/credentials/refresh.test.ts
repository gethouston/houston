import { afterEach, expect, test, vi } from "vitest";
import { isApiKeyCredential, type WorkspaceCredential } from "../ports";
import { ProviderAccountBlockedError } from "./account-blocked";
import { RefreshRejectedError } from "./oauth-token-exchange";
import { isExpiring, refreshCredential } from "./refresh";

afterEach(() => {
  vi.unstubAllGlobals();
});

const oauthCred: WorkspaceCredential = {
  workspaceId: "ws_1",
  provider: "openai-codex",
  accessToken: "at.stale",
  refreshToken: "rt",
  expiresAt: 1,
};

const okBody = JSON.stringify({
  access_token: "at.fresh",
  refresh_token: "rt.rotated",
  expires_in: 3600,
});

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
  expect(isApiKeyCredential({ ...apiKey, kind: undefined })).toBe(true);
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
      expiresAt: 1,
    }),
  ).toBe(true);
});

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
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a 401 invalid_client is NOT terminal: it condemns OUR client id, not the user's token", async () => {
  stubFetch([reject(401, JSON.stringify({ error: "invalid_client" }))]);
  const err = await refreshError();
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(RefreshRejectedError);
  expect((err as Error).message).toContain("invalid_client");
});

test("a 400 with a non-grant error code is NOT terminal and is not retried", async () => {
  const fetchMock = stubFetch([
    reject(400, JSON.stringify({ error: "server_error" })),
  ]);
  const err = await refreshError();
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(RefreshRejectedError);
  expect((err as Error).message).toContain("server_error");
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
  const realFetch = globalThis.fetch;
  const expiresAtSec = Math.floor(Date.now() / 1000) + 1500;
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
      refreshToken: "gho_github_token",
      expiresAt: 1,
      kind: "oauth",
    });
    expect(fresh.accessToken).toBe("tid=fresh-copilot-token");
    expect(fresh.refreshToken).toBe("gho_github_token");
    expect(fresh.expiresAt).toBe(expiresAtSec * 1000 - 5 * 60 * 1000);
    expect(isApiKeyCredential(fresh)).toBe(false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("refreshCredential refreshes Copilot Enterprise against the company GitHub and preserves the domain", async () => {
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
    expect(tokenUrl).toContain("api.acme.ghe.com/copilot_internal/v2/token");
    expect(fresh.accessToken).toBe("tid=ghe-token");
    expect(fresh.enterpriseUrl).toBe("acme.ghe.com");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("refreshCredential types GitHub's billing lock as an account block, not a dead token", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("copilot_internal/v2/token")) {
      return new Response(
        JSON.stringify({
          error_details: {
            message:
              "Your account's billing is currently locked because recent account charges have failed. Please update your payment method to restore access.",
            url: "https://github.com/settings/billing",
            notification_id: "billing_locked",
          },
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch in test: ${u}`);
  }) as typeof fetch;
  try {
    const attempt = refreshCredential({
      workspaceId: "ws_1",
      provider: "github-copilot",
      accessToken: "tid=stale",
      refreshToken: "gho_github_token",
      expiresAt: 1,
      kind: "oauth",
    });
    const err = await attempt.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProviderAccountBlockedError);
    expect(err).not.toBeInstanceOf(RefreshRejectedError);
    const blocked = err as ProviderAccountBlockedError;
    expect(blocked.provider).toBe("github-copilot");
    expect(blocked.detail).toMatch(/billing is currently locked/);
    expect(blocked.detail).not.toContain("{");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("any other Copilot mint 403 stays a plain (retryable) error", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error_details: { message: "You do not have access to GitHub Copilot." },
      }),
      { status: 403 },
    )) as typeof fetch;
  try {
    const attempt = refreshCredential({
      workspaceId: "ws_1",
      provider: "github-copilot",
      accessToken: "tid=stale",
      refreshToken: "gho_github_token",
      expiresAt: 1,
      kind: "oauth",
    });
    await expect(attempt).rejects.toThrow();
    await expect(attempt).rejects.not.toBeInstanceOf(
      ProviderAccountBlockedError,
    );
    await expect(attempt).rejects.not.toBeInstanceOf(RefreshRejectedError);
  } finally {
    globalThis.fetch = realFetch;
  }
});

import type { IncomingMessage, ServerResponse } from "node:http";
import { accessDigest } from "@houston/protocol/access-digest";
import { beforeEach, expect, test } from "vitest";
import { sharedCredentialRefresher } from "../credentials/refresh-coalescer";
import { RemoteCredentialDeadError } from "../credentials/remote-store";
import { MemoryCredentialStore } from "../credentials/store";
import type { CredentialStore, CredentialVault } from "../ports";
import { handleSandboxCredential } from "./credential";
import { CredentialServeHealer } from "./credential-healer";

/**
 * The sandbox credential endpoint must keep serving a turn even when the stored
 * credential cannot be refreshed centrally (a refresh is rejected, or the
 * provider has no refresh config). It serves the existing token best-effort
 * instead of 500-ing every turn — otherwise the runtime's multi-provider serve
 * loop spams 500s for a stale, unused credential. API-key credentials are
 * served as-is, never refreshed.
 *
 * Anthropic is special-cased twice:
 *  - it serves ONLY on a gateway-fronted (managed cloud) host — a desktop/
 *    self-host store may hold a pushed-credential durability marker whose
 *    served token would SHADOW the working local keychain credential inside
 *    the Claude Agent SDK (CLAUDE_CODE_OAUTH_TOKEN outranks the config dir);
 *  - a STALE anthropic token is never served best-effort, for the same
 *    shadowing reason — the marked 404 lets the runtime fall back to the
 *    materialized-file path instead.
 */

const vault: CredentialVault = {
  sandboxToken: () => "sbx",
  validateSandboxToken: (t) =>
    t === "sbx" ? { workspaceId: "w1", agentId: "a1" } : null,
};

function mockReq(token = "sbx", actingAs?: string): IncomingMessage {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      ...(actingAs ? { "x-houston-acting-as": actingAs } : {}),
    },
  } as unknown as IncomingMessage;
}

type ServedBody = {
  provider?: string;
  access?: string;
  expires?: number;
  accountId?: string | null;
  kind?: string;
  error?: string;
};

function mockRes(): {
  res: ServerResponse;
  out: { status?: number; headers?: Record<string, string>; body: ServedBody };
} {
  const out: {
    status?: number;
    headers?: Record<string, string>;
    body: ServedBody;
  } = { body: {} };
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      out.status = status;
      out.headers = headers;
    },
    end(buf: Buffer | string) {
      out.body = JSON.parse(buf.toString());
    },
  } as unknown as ServerResponse;
  return { res, out };
}

const call = (
  credentials: CredentialStore,
  provider: string,
  out: ReturnType<typeof mockRes>,
  opts: {
    gatewayFronted?: boolean;
    credentialHealer?: CredentialServeHealer;
    /** WHOSE credential this serve is for (HOU-976); absent = the team row. */
    actingAs?: string;
  } = {},
) =>
  handleSandboxCredential(
    {
      vault,
      credentials,
      gatewayFronted: opts.gatewayFronted,
      credentialHealer: opts.credentialHealer,
    },
    "GET",
    "/sandbox/credential",
    new URL(`http://x/sandbox/credential?provider=${provider}`),
    mockReq("sbx", opts.actingAs),
    out.res,
  );

/** A far-future expiry: not "expiring" for any test run. */
const FRESH_EXPIRES = Date.now() + 60 * 60 * 1000;

/** A gateway-minted acting-as token naming one member (its payload carries the sub). */
const ACTING = `h.${Buffer.from(JSON.stringify({ sub: "u-1" })).toString("base64url")}.sig`;

// The refresher is process-wide (that is what makes it coalesce). Clear its
// single-flight + result cache so tests can't serve each other's tokens.
beforeEach(() => sharedCredentialRefresher.reset());

test("serve miss heals once and serves the fresh central credential", async () => {
  const credentials = new MemoryCredentialStore();
  let heals = 0;
  const credentialHealer = new CredentialServeHealer(async () => {
    heals++;
    await credentials.put({
      workspaceId: "w1",
      provider: "openai-codex",
      accessToken: "AT-healed",
      refreshToken: "",
      expiresAt: FRESH_EXPIRES,
    });
    return true;
  });
  const first = mockRes();
  expect(
    await call(credentials, "openai-codex", first, { credentialHealer }),
  ).toBe(true);
  expect(first.out.body.access).toBe("AT-healed");
  expect(heals).toBe(1);

  await credentials.remove("w1", "openai-codex");
  const second = mockRes();
  await call(credentials, "openai-codex", second, { credentialHealer });
  expect(second.out.status).toBe(404);
  expect(heals).toBe(1);
});

test("concurrent dead serves single-flight their heal", async () => {
  const credentials = new MemoryCredentialStore();
  let heals = 0;
  const credentialHealer = new CredentialServeHealer(async () => {
    heals++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await credentials.put({
      workspaceId: "w1",
      provider: "openai-codex",
      accessToken: "AT-one-flight",
      refreshToken: "",
      expiresAt: FRESH_EXPIRES,
    });
    return true;
  });
  const a = mockRes();
  const b = mockRes();
  await Promise.all([
    call(credentials, "openai-codex", a, { credentialHealer }),
    call(credentials, "openai-codex", b, { credentialHealer }),
  ]);
  expect(heals).toBe(1);
  expect(a.out.body.access).toBe("AT-one-flight");
  expect(b.out.body.access).toBe("AT-one-flight");
});

test("transport errors never trigger credential healing", async () => {
  let heals = 0;
  const credentials: CredentialStore = {
    get: async () => {
      throw new Error("network unavailable");
    },
    put: async () => {},
    remove: async () => {},
    removeIfAccess: async () => false,
  };
  const credentialHealer = new CredentialServeHealer(async () => {
    heals++;
    return true;
  });
  await expect(
    call(credentials, "openai-codex", mockRes(), { credentialHealer }),
  ).rejects.toThrow("network unavailable");
  expect(heals).toBe(0);
});

test("a gateway-classified dead credential triggers healing", async () => {
  const fresh = new MemoryCredentialStore();
  let reads = 0;
  const credentials: CredentialStore = {
    get: async (workspaceId, provider) => {
      reads++;
      if (reads === 1) throw new RemoteCredentialDeadError("dead");
      return fresh.get(workspaceId, provider);
    },
    put: (credential) => fresh.put(credential),
    remove: (workspaceId, provider) => fresh.remove(workspaceId, provider),
    removeIfAccess: async () => false,
  };
  const credentialHealer = new CredentialServeHealer(async () => {
    await credentials.put({
      workspaceId: "w1",
      provider: "openai-codex",
      accessToken: "AT-recaptured",
      refreshToken: "",
      expiresAt: FRESH_EXPIRES,
    });
    return true;
  });
  const result = mockRes();
  await call(credentials, "openai-codex", result, { credentialHealer });
  expect(result.out.body.access).toBe("AT-recaptured");
});

test("serves the existing token when refresh has no config (no 500)", async () => {
  const credentials = new MemoryCredentialStore();
  // An EXPIRING oauth credential for a provider without a central refresh
  // config — refreshCredential throws. Before the fix this returned 500 on
  // every serve.
  await credentials.put({
    workspaceId: "w1",
    provider: "kimi-coding",
    accessToken: "stale-AT",
    refreshToken: "RT",
    expiresAt: 1, // long past → "expiring"
  });
  const r = mockRes();
  expect(await call(credentials, "kimi-coding", r)).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body.provider).toBe("kimi-coding");
  expect(r.out.body.access).toBe("stale-AT"); // existing token served, not a 500
  expect(r.out.body.kind).toBe("oauth");
});

test("a terminally-rejected refresh disconnects the credential (marked 404)", async () => {
  // The token endpoint's 401 (refresh_token_invalidated — session ended
  // server-side) never heals on retry. Before the fix this logged + served the
  // expired token on EVERY serve, forever, while turns failed with "No API
  // key" and the provider still read as connected.
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "expired-AT",
    refreshToken: "rt.dead",
    expiresAt: 1,
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ error: { code: "refresh_token_invalidated" } }),
      { status: 401 },
    )) as typeof fetch;
  try {
    const r = mockRes();
    expect(await call(credentials, "openai-codex", r)).toBe(true);
    expect(r.out.status).toBe(404);
    expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
    // The dead credential is gone: the next serve answers "not connected"
    // without another doomed refresh attempt.
    expect(await credentials.get("w1", "openai-codex")).toBeNull();
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a rejected refresh keeps a credential that was rotated underneath", async () => {
  // The rejection condemns ONE token, and the store can move on while the token
  // endpoint is still answering — a reconnect, or a sibling host that rotated
  // the credential. A blind remove here would delete the connection the user
  // just made and sign them out for someone else's dead token. Compare-and-
  // delete: the digest doesn't match, nothing is dropped, and the serve
  // continues with what the store holds NOW.
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "expired-AT",
    refreshToken: "rt.dead",
    expiresAt: 1,
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    // Racing the exchange: this lands after the refresher re-read the store and
    // before its rejection reaches the route.
    await credentials.put({
      workspaceId: "w1",
      provider: "openai-codex",
      accessToken: "reconnected-AT",
      refreshToken: "rt.fresh",
      expiresAt: FRESH_EXPIRES,
    });
    return new Response(JSON.stringify({ error: "invalid_grant" }), {
      status: 400,
    });
  }) as typeof fetch;
  try {
    const r = mockRes();
    expect(await call(credentials, "openai-codex", r)).toBe(true);
    expect(r.out.status).toBe(200);
    expect(r.out.body.access).toBe("reconnected-AT");
    expect((await credentials.get("w1", "openai-codex"))?.accessToken).toBe(
      "reconnected-AT",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a rejected personal refresh never touches the team credential", async () => {
  // Scope is part of the delete, not decoration (HOU-976): one member's dead
  // subscription must not disconnect the workspace's shared one. The store call
  // carries both WHICH kind of row (scope) and WHOSE (the acting identity).
  const memory = new MemoryCredentialStore();
  const removals: {
    accessSha256: string;
    opts?: { scope?: "personal" | "team"; actingAs?: string };
  }[] = [];
  const credentials: CredentialStore = {
    get: (workspaceId, provider, acting) =>
      memory.get(workspaceId, provider, acting),
    put: (cred, opts) => memory.put(cred, opts),
    remove: (workspaceId, provider, acting) =>
      memory.remove(workspaceId, provider, acting),
    removeIfAccess: (workspaceId, provider, accessSha256, opts) => {
      removals.push({ accessSha256, opts });
      return memory.removeIfAccess(workspaceId, provider, accessSha256, opts);
    },
  };
  await memory.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "team-AT",
    refreshToken: "rt.team",
    expiresAt: FRESH_EXPIRES,
  });
  await memory.put(
    {
      workspaceId: "w1",
      provider: "openai-codex",
      accessToken: "member-AT",
      refreshToken: "rt.dead",
      expiresAt: 1,
      scope: "personal",
    },
    { actingAs: ACTING },
  );
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "invalid_grant" }), {
      status: 400,
    })) as typeof fetch;
  try {
    const r = mockRes();
    expect(
      await call(credentials, "openai-codex", r, { actingAs: ACTING }),
    ).toBe(true);
    expect(r.out.status).toBe(404);
    expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
    // The member's row is gone; the team's is untouched.
    expect(await memory.get("w1", "openai-codex", { actingAs: ACTING })).toBe(
      null,
    );
    expect((await memory.get("w1", "openai-codex"))?.accessToken).toBe(
      "team-AT",
    );
    expect(removals).toEqual([
      {
        accessSha256: accessDigest("member-AT"),
        opts: { scope: "personal", actingAs: ACTING },
      },
    ]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a transient refresh failure keeps serving the existing token", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "maybe-still-good-AT",
    refreshToken: "rt.fine",
    expiresAt: 1,
  });
  const realFetch = globalThis.fetch;
  let exchanges = 0;
  globalThis.fetch = (async () => {
    exchanges++;
    return new Response("upstream sad", { status: 503 });
  }) as typeof fetch;
  try {
    const r = mockRes();
    expect(await call(credentials, "openai-codex", r)).toBe(true);
    expect(r.out.status).toBe(200);
    expect(r.out.body.access).toBe("maybe-still-good-AT");
    // A blip must not sign the workspace out.
    expect(await credentials.get("w1", "openai-codex")).not.toBeNull();
    // And it must not be retried: a 5xx can land after the endpoint already
    // rotated the refresh token, so attempt 2 would spend a spent grant.
    expect(exchanges).toBe(1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a credential disconnected mid-refresh answers marked 404 without a delete", async () => {
  // The user hit Disconnect between the route's read and the coalescer's
  // critical section. Refreshing anyway recreates the row they deleted; the
  // route must simply report "not connected".
  const memory = new MemoryCredentialStore();
  await memory.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "expiring-AT",
    refreshToken: "rt.rotating",
    expiresAt: 1,
  });
  let reads = 0;
  let removals = 0;
  const credentials: CredentialStore = {
    get: async (workspaceId, provider, acting) =>
      ++reads === 1 ? memory.get(workspaceId, provider, acting) : null,
    put: (cred, opts) => memory.put(cred, opts),
    remove: (workspaceId, provider, acting) =>
      memory.remove(workspaceId, provider, acting),
    removeIfAccess: async () => {
      removals++;
      return false;
    },
  };
  const realFetch = globalThis.fetch;
  let exchanges = 0;
  globalThis.fetch = (async () => {
    exchanges++;
    throw new Error("the token endpoint must never be called");
  }) as typeof fetch;
  try {
    const r = mockRes();
    expect(await call(credentials, "openai-codex", r)).toBe(true);
    expect(r.out.status).toBe(404);
    expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
    expect(exchanges).toBe(0);
    expect(removals).toBe(0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("concurrent serves of an expiring credential refresh it exactly once", async () => {
  // One runtime process per agent serves per turn AND per /providers poll, so
  // the same expiring credential lands here several times at once. openai-codex
  // rotates the refresh token on use: refreshing twice makes the second
  // exchange invalid_grant, which the route reads as "session ended" and the
  // user's provider disconnects itself. One burst = one exchange.
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "expiring-AT",
    refreshToken: "rt.rotating",
    expiresAt: 1,
  });
  let exchanges = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    exchanges++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(
      JSON.stringify({
        access_token: "rotated-AT",
        refresh_token: "rt.rotated",
        expires_in: 3600,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const a = mockRes();
    const b = mockRes();
    await Promise.all([
      call(credentials, "openai-codex", a),
      call(credentials, "openai-codex", b),
    ]);
    expect(exchanges).toBe(1);
    expect(a.out.status).toBe(200);
    expect(b.out.status).toBe(200);
    expect(a.out.body.access).toBe("rotated-AT");
    expect(b.out.body.access).toBe("rotated-AT");
    expect((await credentials.get("w1", "openai-codex"))?.refreshToken).toBe(
      "rt.rotated",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("serves an api-key credential as kind=api_key without refreshing", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "opencode-go",
    accessToken: "sk-go",
    refreshToken: "",
    expiresAt: 0,
    kind: "api_key",
  });
  const r = mockRes();
  expect(await call(credentials, "opencode-go", r)).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body).toMatchObject({
    provider: "opencode-go",
    access: "sk-go",
    kind: "api_key",
  });
});

test("serves a gateway access-only OAuth credential without local refresh", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "served-AT",
    refreshToken: "",
    expiresAt: 1, // expiring, but the gateway is the only refresher
    kind: "oauth",
  });
  const r = mockRes();
  expect(await call(credentials, "openai-codex", r)).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body).toMatchObject({
    provider: "openai-codex",
    access: "served-AT",
    kind: "oauth",
  });
});

test("404 when the workspace has not connected the provider", async () => {
  const credentials = new MemoryCredentialStore();
  const r = mockRes();
  expect(await call(credentials, "openai-codex", r)).toBe(true);
  expect(r.out.status).toBe(404);
  // The authoritative marker: the runtime only drops served credentials on
  // marked 404s, never on a bare route-level 404.
  expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
});

test("anthropic is NOT served off the managed cloud, even when stored", async () => {
  // A desktop/self-host store can hold the durability marker written when a
  // credential was pushed to a pod. Serving it locally would shadow the
  // working keychain credential — the marked 404 keeps the local flow intact.
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-marker",
    refreshToken: "RT",
    expiresAt: FRESH_EXPIRES,
  });
  const r = mockRes();
  expect(await call(credentials, "anthropic", r)).toBe(true);
  expect(r.out.status).toBe(404);
  expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
});

test("anthropic serves access-only on a gateway-fronted host", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-fresh",
    refreshToken: "", // gateway serves access-only; refresh never reaches pods
    expiresAt: FRESH_EXPIRES,
    kind: "oauth",
  });
  const r = mockRes();
  expect(
    await call(credentials, "anthropic", r, { gatewayFronted: true }),
  ).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body).toMatchObject({
    provider: "anthropic",
    access: "sk-ant-oat01-fresh",
    kind: "oauth",
  });
});

test("a STALE anthropic token is never served (marked 404 instead)", async () => {
  // A stale served token would outrank the pod's materialized file inside the
  // SDK; degrading to not-connected lets the file path keep working.
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-stale",
    refreshToken: "", // access-only AND expired: the gateway could not refresh
    expiresAt: 1,
    kind: "oauth",
  });
  const r = mockRes();
  expect(
    await call(credentials, "anthropic", r, { gatewayFronted: true }),
  ).toBe(true);
  expect(r.out.status).toBe(404);
  expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
});

test("an expiring anthropic credential whose refresh fails degrades to marked 404", async () => {
  // refreshCredential throws for anthropic (no TS refresh config — the Go
  // gateway refreshes upstream). The stale guard must catch the still-expiring
  // credential instead of best-effort-serving it.
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-stale",
    refreshToken: "RT",
    expiresAt: 1,
  });
  const r = mockRes();
  expect(
    await call(credentials, "anthropic", r, { gatewayFronted: true }),
  ).toBe(true);
  expect(r.out.status).toBe(404);
  expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
});

test("a token below pi's five-minute validity floor is refreshed at serve time (PRODUCT-1317)", async () => {
  // pi refreshes any stored OAuth entry within 5 minutes of expiry, and a
  // served entry has refresh:"" — so a token served with less than the floor
  // is born inside pi's refresh window. The old 2-minute default skew served
  // exactly such tokens; the serve margin must stay above pi's floor.
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "AT-four-minutes",
    refreshToken: "rt.live",
    expiresAt: Date.now() + 4 * 60_000, // fine for the old skew, inside pi's window
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        access_token: "AT-rotated",
        refresh_token: "rt.rotated",
        expires_in: 3600,
      }),
      { status: 200 },
    )) as typeof fetch;
  try {
    const r = mockRes();
    expect(await call(credentials, "openai-codex", r)).toBe(true);
    expect(r.out.status).toBe(200);
    expect(r.out.body.access).toBe("AT-rotated");
    // The served token clears pi's floor with room to spare.
    expect(r.out.body.expires).toBeGreaterThan(Date.now() + 30 * 60_000);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a healthy long-lived token is served as-is, no token-endpoint call", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "AT-healthy",
    refreshToken: "rt.live",
    expiresAt: FRESH_EXPIRES,
  });
  const realFetch = globalThis.fetch;
  let exchanges = 0;
  globalThis.fetch = (async () => {
    exchanges++;
    throw new Error("no refresh expected");
  }) as typeof fetch;
  try {
    const r = mockRes();
    expect(await call(credentials, "openai-codex", r)).toBe(true);
    expect(r.out.status).toBe(200);
    expect(r.out.body.access).toBe("AT-healthy");
    expect(exchanges).toBe(0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an anthropic token below pi's floor is never served (marked 404)", async () => {
  // A served anthropic entry lands in the runtime's auth.json access-only,
  // where pi's usage probes put it through the same 5-minute refresh window —
  // and there is no central refresh config to rescue it here (PRODUCT-1317).
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-four-minutes",
    refreshToken: "",
    expiresAt: Date.now() + 4 * 60_000,
    kind: "oauth",
  });
  const r = mockRes();
  expect(
    await call(credentials, "anthropic", r, { gatewayFronted: true }),
  ).toBe(true);
  expect(r.out.status).toBe(404);
  expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
});

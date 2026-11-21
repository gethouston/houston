import type { IncomingMessage, ServerResponse } from "node:http";
import { accessDigest } from "@houston/protocol/access-digest";
import { beforeEach, expect, test, vi } from "vitest";
import { captureRuntimeCredential } from "../channel/capture-credential";
import { sharedCredentialRefresher } from "../credentials/refresh-coalescer";
import {
  RemoteCredentialBlockedError,
  RemoteCredentialDeadError,
} from "../credentials/remote-store";
import { MemoryCredentialStore } from "../credentials/store";
import type { CredentialStore, CredentialVault } from "../ports";
import { handleSandboxCredential } from "./credential";
import { CredentialServeHealer } from "./credential-healer";

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
  code?: string;
  detail?: string;
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

const FRESH_EXPIRES = Date.now() + 60 * 60 * 1000;

const ACTING = `h.${Buffer.from(JSON.stringify({ sub: "u-1" })).toString("base64url")}.sig`;

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

test("a serve miss heals the pasted anthropic setup token from the runtime and serves it (PRODUCT-1370)", async () => {
  const credentials = new MemoryCredentialStore();
  const exportUrls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/export")) {
        exportUrls.push(url);
        return Response.json({
          provider: "anthropic",
          kind: "api_key",
          key: "sk-ant-oat01-healed",
        });
      }
      return new Response("not found", { status: 404 });
    }),
  );
  try {
    const credentialHealer = new CredentialServeHealer(async (args) => {
      const result = await captureRuntimeCredential({
        endpoint: { baseUrl: "http://runtime", token: "runtime-token" },
        credentials,
        workspaceId: args.workspaceId,
        provider: args.provider,
        localOriginOnly: true,
        actingAs: args.actingAs,
        ifAbsent: true,
      });
      return result.ok;
    });
    const r = mockRes();
    expect(
      await call(credentials, "anthropic", r, {
        gatewayFronted: true,
        credentialHealer,
      }),
    ).toBe(true);
    expect(r.out.status).toBe(200);
    expect(r.out.body).toMatchObject({
      provider: "anthropic",
      access: "sk-ant-oat01-healed",
      kind: "api_key",
    });
    expect(exportUrls).toEqual([
      "http://runtime/auth/export?provider=anthropic&excludeServed=1",
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
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
  await credentials.put({
    workspaceId: "w1",
    provider: "kimi-coding",
    accessToken: "stale-AT",
    refreshToken: "RT",
    expiresAt: 1,
  });
  const r = mockRes();
  expect(await call(credentials, "kimi-coding", r)).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body.provider).toBe("kimi-coding");
  expect(r.out.body.access).toBe("stale-AT");
  expect(r.out.body.kind).toBe("oauth");
});

test("a terminally-rejected refresh disconnects the credential (marked 404)", async () => {
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
    expect(await credentials.get("w1", "openai-codex")).toBeNull();
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a rejected refresh keeps a credential that was rotated underneath", async () => {
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
    expect(await credentials.get("w1", "openai-codex")).not.toBeNull();
    expect(exchanges).toBe(1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a credential disconnected mid-refresh answers marked 404 without a delete", async () => {
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
    expiresAt: 1,
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
  expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
});

test("anthropic is NOT served off the managed cloud, even when stored", async () => {
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
  expect(r.out.headers?.["x-houston-not-served-here"]).toBe("1");
});

test("a real not-connected 404 carries no not-served-here marker", async () => {
  const credentials = new MemoryCredentialStore();
  const r = mockRes();
  expect(await call(credentials, "openai-codex", r)).toBe(true);
  expect(r.out.status).toBe(404);
  expect(r.out.headers?.["x-houston-not-served-here"]).toBeUndefined();
});

test("anthropic serves access-only on a gateway-fronted host", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-fresh",
    refreshToken: "",
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

test("a captured anthropic setup token (api_key) serves on a gateway-fronted host (PRODUCT-1370)", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-setup-token",
    refreshToken: "",
    expiresAt: Number.MAX_SAFE_INTEGER,
    kind: "api_key",
  });
  const r = mockRes();
  expect(
    await call(credentials, "anthropic", r, { gatewayFronted: true }),
  ).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body).toMatchObject({
    provider: "anthropic",
    access: "sk-ant-oat01-setup-token",
    kind: "api_key",
  });
});

test("a STALE anthropic token is never served (marked 404 instead)", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-stale",
    refreshToken: "",
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

test("a short-but-live anthropic token is served, not refused (deploy-order independence)", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "anthropic",
    accessToken: "sk-ant-oat01-shortlive",
    refreshToken: "",
    expiresAt: Date.now() + 5.5 * 60 * 1000,
    kind: "oauth",
  });
  const r = mockRes();
  expect(
    await call(credentials, "anthropic", r, { gatewayFronted: true }),
  ).toBe(true);
  expect(r.out.status).toBe(200);
  expect(r.out.body.access).toBe("sk-ant-oat01-shortlive");
});

test("a token below pi's five-minute validity floor is refreshed at serve time (PRODUCT-1317)", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "AT-four-minutes",
    refreshToken: "rt.live",
    expiresAt: Date.now() + 4 * 60_000,
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

test("an anthropic token below pi's floor is still served while live (guard owns the window)", async () => {
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
  expect(r.out.status).toBe(200);
  expect(r.out.body.access).toBe("sk-ant-oat01-four-minutes");
});

test("fresh=1 sheds the store's cached answer before the read (PRODUCT-1515)", async () => {
  const memory = new MemoryCredentialStore();
  await memory.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "AT-fresh",
    refreshToken: "",
    expiresAt: FRESH_EXPIRES,
  });
  const invalidated: { provider: string; actingAs?: string }[] = [];
  const credentials: CredentialStore = {
    get: (workspaceId, provider, acting) =>
      memory.get(workspaceId, provider, acting),
    put: (cred, opts) => memory.put(cred, opts),
    remove: (workspaceId, provider, acting) =>
      memory.remove(workspaceId, provider, acting),
    removeIfAccess: (workspaceId, provider, sha, opts) =>
      memory.removeIfAccess(workspaceId, provider, sha, opts),
    invalidate: (provider, acting) =>
      invalidated.push({ provider, actingAs: acting?.actingAs }),
  };
  const serve = (query: string, actingAs?: string) => {
    const out = mockRes();
    return handleSandboxCredential(
      { vault, credentials },
      "GET",
      "/sandbox/credential",
      new URL(`http://x/sandbox/credential?${query}`),
      mockReq("sbx", actingAs),
      out.res,
    ).then(() => out);
  };

  const plain = await serve("provider=openai-codex");
  expect(plain.out.status).toBe(200);
  expect(invalidated).toEqual([]);

  const fresh = await serve("provider=openai-codex&fresh=1");
  expect(fresh.out.status).toBe(200);
  expect(invalidated).toEqual([
    { provider: "openai-codex", actingAs: undefined },
  ]);

  await serve("provider=openai-codex&fresh=1", ACTING);
  expect(invalidated[1]).toEqual({
    provider: "openai-codex",
    actingAs: ACTING,
  });
});

test("OpenAI's invalid_refresh_token verdict disconnects the credential (marked 404)", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "expired-AT",
    refreshToken: "rt.dead",
    expiresAt: 1,
  });
  const realFetch = globalThis.fetch;
  let upstream = 0;
  globalThis.fetch = (async () => {
    upstream++;
    return new Response(
      '{"error":{"message":"Could not validate your refresh token. Please try signing in again.","type":"invalid_request_error","param":null,"code":"invalid_refresh_token"}}',
      { status: 401 },
    );
  }) as typeof fetch;
  try {
    const r = mockRes();
    expect(await call(credentials, "openai-codex", r)).toBe(true);
    expect(r.out.status).toBe(404);
    expect(r.out.headers?.["x-houston-not-connected"]).toBe("1");
    expect(await credentials.get("w1", "openai-codex")).toBeNull();
    const again = mockRes();
    expect(await call(credentials, "openai-codex", again)).toBe(true);
    expect(again.out.status).toBe(404);
    expect(upstream).toBe(1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a gateway account-block 502 is relayed typed, never as a sign-out", async () => {
  const blocked: CredentialStore = {
    get: async () => {
      throw new RemoteCredentialBlockedError(
        "github-copilot",
        "Your account's billing is currently locked because recent account charges have failed.",
      );
    },
    put: async () => {},
    remove: async () => {},
    removeIfAccess: async () => false,
  } as unknown as CredentialStore;
  const r = mockRes();
  expect(await call(blocked, "github-copilot", r)).toBe(true);
  expect(r.out.status).toBe(502);
  expect(r.out.headers?.["x-houston-not-connected"]).toBeUndefined();
  expect(r.out.headers?.["retry-after"]).toBe("60");
  expect(r.out.body).toMatchObject({
    error: "provider account blocked",
    code: "provider_account_blocked",
    detail: expect.stringContaining("billing"),
  });
});

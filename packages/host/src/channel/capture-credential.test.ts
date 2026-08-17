import { afterEach, expect, test, vi } from "vitest";
import { RemoteCredentialStore } from "../credentials/remote-store";
import type { CredentialStore, WorkspaceCredential } from "../ports";
import { captureRuntimeCredential } from "./capture-credential";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A CredentialStore fake recording every put with the opts it received. */
function recordingStore(existing: WorkspaceCredential | null = null) {
  const puts: Array<{
    credential: WorkspaceCredential;
    opts?: { ifAbsent?: boolean; actingAs?: string };
  }> = [];
  const credentials: CredentialStore = {
    get: async () => existing,
    put: async (credential, opts) => {
      puts.push({ credential, opts });
    },
    remove: async () => {},
    removeIfAccess: async () => false,
  };
  return { credentials, puts };
}

/** Stubs global fetch with a connected runtime; scrub replies via `scrub()`. */
function stubRuntimeFetch(scrub: () => Response) {
  const scrubUrls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/auth/export"))
        return Response.json({
          provider: "openai-codex",
          access: "AT",
          refresh: "RT",
          expires: 123,
        });
      if (url.includes("/auth/scrub-refresh")) {
        scrubUrls.push(url);
        return scrub();
      }
      return new Response("not found", { status: 404 });
    }),
  );
  return scrubUrls;
}

test("full export stores once then scrubs once, provider-scoped", async () => {
  const { credentials, puts } = recordingStore();
  const scrubUrls = stubRuntimeFetch(() => Response.json({ ok: true }));

  expect(
    await captureRuntimeCredential({
      endpoint: { baseUrl: "http://runtime", token: "runtime-token" },
      credentials,
      workspaceId: "workspace",
      provider: "openai-codex",
      requireRefresh: true,
    }),
  ).toEqual({ ok: true, provider: "openai-codex" });
  expect(puts).toHaveLength(1);
  expect(puts[0]?.credential.refreshToken).toBe("RT");
  // A user-initiated capture is a FULL put (it may supersede a tombstone)...
  expect(puts[0]?.opts?.ifAbsent).toBeUndefined();
  // ...and the scrub names the provider it captured (PRODUCT-1320), so a
  // concurrent connect's freshly-written refresh token survives on the runtime.
  expect(scrubUrls).toEqual([
    "http://runtime/auth/scrub-refresh?provider=openai-codex",
  ]);
});

test("a scrub failure after a landed central PUT settles as success and logs PRODUCT-1318", async () => {
  // The connect DID succeed (the credential is stored and serving). Failing the
  // capture here made the web client replay the entire credential PUT — the
  // tombstone-clearing full PUT — while never fixing the leftover refresh token.
  // The serve-sync self-heal owns that now; capture settles and shouts.
  const { credentials, puts } = recordingStore();
  stubRuntimeFetch(() => new Response("scrub exploded", { status: 503 }));
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});

  expect(
    await captureRuntimeCredential({
      endpoint: { baseUrl: "http://runtime", token: "runtime-token" },
      credentials,
      workspaceId: "workspace",
      provider: "openai-codex",
    }),
  ).toEqual({ ok: true, provider: "openai-codex" });
  expect(puts).toHaveLength(1);
  expect(
    errors.mock.calls.some((c) => String(c[0]).includes("PRODUCT-1318")),
  ).toBe(true);
});

test("a replayed capture with nothing left to export settles against the central store", async () => {
  // Retry after an ambiguous response: the first attempt stored AND scrubbed,
  // so the replay's export is empty. The central row proves settlement — the
  // replay must report success, not fail a connect that worked.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({})),
  );
  const settled = await captureRuntimeCredential({
    endpoint: { baseUrl: "http://runtime", token: "runtime-token" },
    credentials: recordingStore({
      workspaceId: "workspace",
      provider: "openai-codex",
      accessToken: "AT",
      refreshToken: "RT",
      expiresAt: 123,
    }).credentials,
    workspaceId: "workspace",
    provider: "openai-codex",
  });
  expect(settled).toEqual({ ok: true, provider: "openai-codex" });

  // With no central row it stays the honest "not connected yet".
  const unsettled = await captureRuntimeCredential({
    endpoint: { baseUrl: "http://runtime", token: "runtime-token" },
    credentials: recordingStore(null).credentials,
    workspaceId: "workspace",
    provider: "openai-codex",
  });
  expect(unsettled).toMatchObject({ ok: false, status: 400 });
});

test("an automatic (healer) capture rides the gateway's if-absent maintenance contract", async () => {
  // The serve healer re-pushes a pod's leftover copy with NO user behind it.
  // A plain PUT would clear the gateway's revocation tombstone (cloud #230) —
  // the one resurrection path that survived. Assert the flag reaches the wire.
  const gatewayPuts: Array<{ url: string; ifAbsent: string | null }> = [];
  const gatewayFetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    if (init?.method === "PUT") {
      gatewayPuts.push({
        url: String(input),
        ifAbsent: new Headers(init.headers).get("x-houston-if-absent") ?? null,
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  const credentials = new RemoteCredentialStore({
    baseUrl: "http://gateway",
    orgSlug: "acme",
    agentSlug: "sales",
    podToken: "pod-token",
    fetchImpl: gatewayFetch,
  });
  stubRuntimeFetch(() => Response.json({ ok: true }));

  expect(
    await captureRuntimeCredential({
      endpoint: { baseUrl: "http://runtime", token: "runtime-token" },
      credentials,
      workspaceId: "workspace",
      provider: "openai-codex",
      requireRefresh: true,
      ifAbsent: true,
    }),
  ).toEqual({ ok: true, provider: "openai-codex" });
  expect(gatewayPuts).toHaveLength(1);
  expect(gatewayPuts[0]?.ifAbsent).toBe("1");
});

test("heal mode rejects an api-key export before storing", async () => {
  let puts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ provider: "openrouter", kind: "api_key", key: "sk" }),
    ),
  );
  const result = await captureRuntimeCredential({
    endpoint: { baseUrl: "http://runtime", token: "runtime-token" },
    credentials: {
      get: async () => null,
      put: async () => {
        puts++;
      },
      remove: async () => {},
      removeIfAccess: async () => false,
    },
    workspaceId: "workspace",
    provider: "openrouter",
    requireRefresh: true,
  });
  expect(result.ok).toBe(false);
  expect(puts).toBe(0);
});

test("a google api-key export that is an OAuth-type token is rejected before storing", async () => {
  // The capture-side door of Sentry HOUSTON-APP-567: pushing a legacy runtime
  // entry centrally would seed the store with a key every serve refuses.
  let puts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        provider: "google",
        kind: "api_key",
        key: "ya29.a0LegacyOAuthToken",
      }),
    ),
  );
  const result = await captureRuntimeCredential({
    endpoint: { baseUrl: "http://runtime", token: "runtime-token" },
    credentials: {
      get: async () => null,
      put: async () => {
        puts++;
      },
      remove: async () => {},
      removeIfAccess: async () => false,
    },
    workspaceId: "workspace",
    provider: "google",
  });
  expect(result).toMatchObject({ ok: false, status: 400 });
  expect(result.ok === false && result.error).toMatch(/OAuth-type token/);
  expect(puts).toBe(0);
});

test("a real AIza google api-key export still captures", async () => {
  const stored: WorkspaceCredential[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        provider: "google",
        kind: "api_key",
        key: "AIzaSyRealKey",
      }),
    ),
  );
  const result = await captureRuntimeCredential({
    endpoint: { baseUrl: "http://runtime", token: "runtime-token" },
    credentials: {
      get: async () => null,
      put: async (credential) => {
        stored.push(credential);
      },
      remove: async () => {},
      removeIfAccess: async () => false,
    },
    workspaceId: "workspace",
    provider: "google",
  });
  expect(result).toEqual({ ok: true, provider: "google" });
  expect(stored[0]?.accessToken).toBe("AIzaSyRealKey");
});

test("a new-format AQ. google auth key captures too (PRODUCT-1368)", async () => {
  // AI Studio issues AQ.-prefixed auth keys since 2026; only OAuth material
  // (ya29./eyJ) is refused from shape.
  const stored: WorkspaceCredential[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        provider: "google",
        kind: "api_key",
        key: "AQ.Ab8RN6JkyDLMExampleAuthKey",
      }),
    ),
  );
  const result = await captureRuntimeCredential({
    endpoint: { baseUrl: "http://runtime", token: "runtime-token" },
    credentials: {
      get: async () => null,
      put: async (credential) => {
        stored.push(credential);
      },
      remove: async () => {},
      removeIfAccess: async () => false,
    },
    workspaceId: "workspace",
    provider: "google",
  });
  expect(result).toEqual({ ok: true, provider: "google" });
  expect(stored[0]?.accessToken).toBe("AQ.Ab8RN6JkyDLMExampleAuthKey");
});

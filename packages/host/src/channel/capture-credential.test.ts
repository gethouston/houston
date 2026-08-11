import { afterEach, expect, test, vi } from "vitest";
import type { CredentialStore, WorkspaceCredential } from "../ports";
import { captureRuntimeCredential } from "./capture-credential";

afterEach(() => vi.unstubAllGlobals());

test("full export stores once then scrubs once", async () => {
  const stored: WorkspaceCredential[] = [];
  let scrubCalls = 0;
  const credentials: CredentialStore = {
    get: async () => null,
    put: async (credential) => {
      stored.push(credential);
    },
    remove: async () => {},
    removeIfAccess: async () => false,
  };
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
      if (url.endsWith("/auth/scrub-refresh")) {
        scrubCalls++;
        return Response.json({ ok: true });
      }
      return new Response("not found", { status: 404 });
    }),
  );

  expect(
    await captureRuntimeCredential({
      endpoint: { baseUrl: "http://runtime", token: "runtime-token" },
      credentials,
      workspaceId: "workspace",
      provider: "openai-codex",
      requireRefresh: true,
    }),
  ).toEqual({ ok: true, provider: "openai-codex" });
  expect(stored).toHaveLength(1);
  expect(stored[0]?.refreshToken).toBe("RT");
  expect(scrubCalls).toBe(1);
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

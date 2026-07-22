import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  FileCustomSecretStore,
  RemoteCustomSecretStore,
  secretIdFor,
} from "./secrets";

/**
 * FileCustomSecretStore holds credential VALUES (API keys, MCP tokens) — the
 * one thing definitions never carry. The load-bearing property under test:
 * the file is 0600 on disk (this is the whole security model for local/self-host
 * custody; a future cloud adapter moves custody elsewhere, but locally this
 * file mode IS the protection).
 */

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "houston-custom-secrets-"));
  path = join(dir, "custom-secrets.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("get() on a missing file returns null, not a throw", async () => {
  const store = new FileCustomSecretStore(path);
  expect(await store.get("ci_acme_token")).toBeNull();
});

test("set/get/delete roundtrip", async () => {
  const store = new FileCustomSecretStore(path);
  await store.set("ci_acme_token", "sk-live-123");
  expect(await store.get("ci_acme_token")).toBe("sk-live-123");

  await store.delete("ci_acme_token");
  expect(await store.get("ci_acme_token")).toBeNull();

  // Deleting an absent id is a no-op, not an error.
  await store.delete("never-set");
});

test("multiple ids coexist independently", async () => {
  const store = new FileCustomSecretStore(path);
  await store.set("ci_acme_token", "a");
  await store.set("ci_beta_token", "b");
  expect(await store.get("ci_acme_token")).toBe("a");
  expect(await store.get("ci_beta_token")).toBe("b");
  await store.delete("ci_acme_token");
  expect(await store.get("ci_acme_token")).toBeNull();
  expect(await store.get("ci_beta_token")).toBe("b");
});

// POSIX custody: the 0600 file mode IS the protection. Windows has no POSIX
// modes (stat reports a synthesized 0666; NTFS ACLs under the user profile
// are the user-scoped protection there), so this assertion is POSIX-only.
test.runIf(process.platform !== "win32")(
  "the secret file is written 0600, not world/group readable",
  async () => {
    const store = new FileCustomSecretStore(path);
    await store.set("ci_acme_token", "sk-live-123");
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);

    // A later write over an EXISTING file re-asserts 0600 even if the file's
    // mode was widened out-of-band.
    chmodSync(path, 0o644);
    await store.set("ci_acme_token", "sk-live-456");
    expect(statSync(path).mode & 0o777).toBe(0o600);
  },
);

// Windows custody: no chmod on the write path (POSIX-only concept), and a
// destination some backup/AV tool marked read-only must not break the save
// (rename-replace over a read-only file fails EPERM unless cleared first).
test.runIf(process.platform === "win32")(
  "windows: writes succeed, including over a read-only destination",
  async () => {
    const store = new FileCustomSecretStore(path);
    await store.set("ci_acme_token", "sk-live-123");
    expect(await store.get("ci_acme_token")).toBe("sk-live-123");

    chmodSync(path, 0o400); // sets the read-only attribute on Windows
    await store.set("ci_acme_token", "sk-live-456");
    expect(await store.get("ci_acme_token")).toBe("sk-live-456");
  },
);

test("secretIdFor is stable and namespaced per slug+variable", () => {
  expect(secretIdFor("acme", "token")).toBe("ci_acme_token");
  expect(secretIdFor("acme", "apiKey")).toBe("ci_acme_apiKey");
  expect(secretIdFor("beta", "token")).toBe("ci_beta_token");
  expect(secretIdFor("acme", "token")).not.toBe(secretIdFor("beta", "token"));
});

test("remote store uses the scoped pod route and never echoes writes locally", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (!init?.method)
      return new Response(JSON.stringify({ value: "remote-key" }), {
        status: 200,
      });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const store = new RemoteCustomSecretStore({
    baseUrl: "https://gateway.example/",
    orgSlug: "0123456789abcdef",
    agentSlug: "aaaaaaaaaaaaaaaa",
    podToken: "host-token",
    cacheTtlMs: 0, // pin the wire protocol; caching has its own test below
    fetchImpl: fetchImpl as typeof fetch,
  });
  await store.set("ci_acme_token", "never-on-disk");
  expect(await store.get("ci_acme_token")).toBe("remote-key");
  await store.delete("ci_acme_token");
  expect(calls.map((call) => call.init?.method ?? "GET")).toEqual([
    "PUT",
    "GET",
    "DELETE",
  ]);
  expect(calls[0]?.url).toContain(
    "/v1/pod/custom-secrets/0123456789abcdef/aaaaaaaaaaaaaaaa/ci_acme_token",
  );
  expect(
    (calls[0]?.init?.headers as Record<string, string>).Authorization,
  ).toBe("Bearer host-token");
});

test("remote store serves repeated reads from a short write-through cache", async () => {
  let gets = 0;
  const store = new RemoteCustomSecretStore({
    baseUrl: "https://gateway.example",
    orgSlug: "0123456789abcdef",
    agentSlug: "aaaaaaaaaaaaaaaa",
    podToken: "host-token",
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      if (!init?.method) {
        gets++;
        return new Response(JSON.stringify({ value: "remote-key" }), {
          status: 200,
        });
      }
      return new Response(`{"ok":true}`, { status: 200 });
    }) as typeof fetch,
  });
  // The executor's provider resolves per request with has() + get(): repeated
  // reads inside the TTL must cost ONE gateway→Secret-Manager round trip.
  expect(await store.get("ci_acme_token")).toBe("remote-key");
  expect(await store.get("ci_acme_token")).toBe("remote-key");
  expect(gets).toBe(1);
  await store.set("ci_acme_token", "v2");
  expect(await store.get("ci_acme_token")).toBe("v2");
  await store.delete("ci_acme_token");
  expect(await store.get("ci_acme_token")).toBeNull();
  expect(gets).toBe(1);
});

test("legacy migration uploads every value before removing the plaintext file", async () => {
  const legacy = new FileCustomSecretStore(path);
  await legacy.set("ci_acme_token", "a");
  await legacy.set("ci_beta_token", "b");
  const uploaded = new Map<string, string>();
  const remote = new RemoteCustomSecretStore({
    baseUrl: "https://gateway.example",
    orgSlug: "0123456789abcdef",
    agentSlug: "aaaaaaaaaaaaaaaa",
    podToken: "host-token",
    legacy,
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      const id = decodeURIComponent(String(url).split("/").at(-1) ?? "");
      const body = JSON.parse(String(init?.body)) as { value: string };
      uploaded.set(id, body.value);
      return new Response(`{"ok":true}`, { status: 200 });
    }) as typeof fetch,
  });
  expect(await remote.migrateLegacy()).toBe(2);
  expect(uploaded).toEqual(
    new Map([
      ["ci_acme_token", "a"],
      ["ci_beta_token", "b"],
    ]),
  );
  expect(existsSync(path)).toBe(false);
});

test("legacy migration keeps the file when any upload fails", async () => {
  const legacy = new FileCustomSecretStore(path);
  await legacy.set("ci_acme_token", "a");
  const remote = new RemoteCustomSecretStore({
    baseUrl: "https://gateway.example",
    orgSlug: "0123456789abcdef",
    agentSlug: "aaaaaaaaaaaaaaaa",
    podToken: "host-token",
    legacy,
    fetchImpl: (async () =>
      new Response("down", { status: 503 })) as typeof fetch,
  });
  await expect(remote.migrateLegacy()).rejects.toThrow("503");
  expect(existsSync(path)).toBe(true);
  expect(await legacy.get("ci_acme_token")).toBe("a");
});

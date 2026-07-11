import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { FileCustomSecretStore, secretIdFor } from "./secrets";

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

test("the secret file is written 0600, not world/group readable", async () => {
  const store = new FileCustomSecretStore(path);
  await store.set("ci_acme_token", "sk-live-123");
  const mode = statSync(path).mode & 0o777;
  expect(mode).toBe(0o600);
});

test("secretIdFor is stable and namespaced per slug+variable", () => {
  expect(secretIdFor("acme", "token")).toBe("ci_acme_token");
  expect(secretIdFor("acme", "apiKey")).toBe("ci_acme_apiKey");
  expect(secretIdFor("beta", "token")).toBe("ci_beta_token");
  expect(secretIdFor("acme", "token")).not.toBe(secretIdFor("beta", "token"));
});

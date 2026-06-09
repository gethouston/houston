import { test, expect } from "bun:test";

/**
 * Cloud (keyless) mode: the runtime runs inside a control plane sandbox with NO
 * real provider key and NO interactive OAuth. These tests pin the two behaviors
 * the sandbox depends on:
 *
 *   1. resolveModel() yields a model whose baseUrl is the control plane keyless proxy and
 *      seeds the sandbox token as the runtime credential (priority #1 in
 *      AuthStorage.getApiKey), so every turn sends it upstream. The real key
 *      lives only in the proxy (see spike/keyless-proxy.ts).
 *   2. Auth status reports the cloud provider connected from the injected creds,
 *      with no OAuth login flow.
 *
 * config.ts snapshots env at import time, so we set the cloud env vars BEFORE
 * importing any module that reads `config`, then import dynamically.
 */

const PROXY = "https://proxy.control-plane.internal";
const TOKEN = "sbx_test_token_8f3a";
const PROVIDER = "anthropic";

process.env.HOUSTON_CLOUD = "1";
process.env.HOUSTON_PROXY_BASE_URL = PROXY;
process.env.HOUSTON_SANDBOX_TOKEN = TOKEN;
process.env.HOUSTON_CLOUD_PROVIDER = PROVIDER;
process.env.HOUSTON_CLOUD_MODEL = "claude-sonnet-4-5";
// Keep auth.json / sessions out of the real home dir.
process.env.HOUSTON_HOME = await (async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  return mkdtempSync(join(tmpdir(), "houston-cloud-"));
})();

const { config } = await import("../config");
const { resolveModel } = await import("./providers");
const { authStorage } = await import("../auth/storage");
const { getAuthStatus, startLogin, logout } = await import("../auth/login");

test("config exposes cloud mode from env", () => {
  expect(config.cloud).toBe(true);
  expect(config.proxyBaseUrl).toBe(PROXY);
  expect(config.sandboxToken).toBe(TOKEN);
  expect(config.cloudProvider).toBe(PROVIDER);
});

test("resolveModel() points baseUrl at the keyless proxy", () => {
  const model = resolveModel();
  expect(model.baseUrl).toBe(PROXY);
  expect(model.provider).toBe(PROVIDER);
  expect(model.id).toBe("claude-sonnet-4-5");
});

test("resolveModel() seeds the sandbox token as the runtime credential", async () => {
  resolveModel();
  // Priority #1 of getApiKey is the runtime override: the turn will send THIS
  // (the non-secret sandbox token) upstream as the credential, never a real key.
  const key = await authStorage.getApiKey(PROVIDER);
  expect(key).toBe(TOKEN);
});

test("auth status reports connected in cloud mode without any OAuth", () => {
  const status = getAuthStatus();
  expect(status.activeProvider).toBe(PROVIDER);

  const cloudProv = status.providers.find((p) => p.provider === PROVIDER);
  expect(cloudProv).toBeDefined();
  expect(cloudProv!.configured).toBe(true);
  // No OAuth login flow exists in cloud mode.
  expect(cloudProv!.login).toBeNull();
});

test("interactive login is disabled (400) in cloud mode", async () => {
  await expect(startLogin(PROVIDER)).rejects.toThrow(/cloud mode/i);
  expect(() => logout(PROVIDER)).toThrow(/cloud mode/i);
});

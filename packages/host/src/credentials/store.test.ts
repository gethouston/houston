import { expect, test } from "vitest";
import type { WorkspaceCredential } from "../ports";
import { isExpiring } from "./refresh";
import { MemoryCredentialStore } from "./store";

const cred = (
  over: Partial<WorkspaceCredential> = {},
): WorkspaceCredential => ({
  workspaceId: "ws_1",
  provider: "openai-codex",
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: Date.now() + 3_600_000,
  ...over,
});

test("MemoryCredentialStore: get is null, then put → get → overwrite → remove", async () => {
  const s = new MemoryCredentialStore();
  expect(await s.get("ws_1", "openai-codex")).toBeNull();

  await s.put(cred());
  expect((await s.get("ws_1", "openai-codex"))?.accessToken).toBe("at");

  // A refresh overwrites the row in place (same workspace+provider key).
  await s.put(cred({ accessToken: "at2", refreshToken: "rt2" }));
  const got = await s.get("ws_1", "openai-codex");
  expect(got?.accessToken).toBe("at2");
  expect(got?.refreshToken).toBe("rt2");

  await s.remove("ws_1", "openai-codex");
  expect(await s.get("ws_1", "openai-codex")).toBeNull();
});

test("MemoryCredentialStore: ifAbsent put fills a hole but never clobbers (HOU-855)", async () => {
  const s = new MemoryCredentialStore();

  // Absent → fills.
  await s.put(cred({ accessToken: "at-fill" }), { ifAbsent: true });
  expect((await s.get("ws_1", "openai-codex"))?.accessToken).toBe("at-fill");

  // Present → the stale snapshot is dropped, the live row survives.
  await s.put(cred({ accessToken: "at-stale", refreshToken: "rt-stale" }), {
    ifAbsent: true,
  });
  const kept = await s.get("ws_1", "openai-codex");
  expect(kept?.accessToken).toBe("at-fill");
  expect(kept?.refreshToken).toBe("rt");
});

test("MemoryCredentialStore: workspaces + providers are isolated keys", async () => {
  const s = new MemoryCredentialStore();
  await s.put(cred({ workspaceId: "ws_a" }));
  await s.put(cred({ workspaceId: "ws_b", accessToken: "bb" }));
  expect((await s.get("ws_a", "openai-codex"))?.accessToken).toBe("at");
  expect((await s.get("ws_b", "openai-codex"))?.accessToken).toBe("bb");
  expect(await s.get("ws_a", "anthropic")).toBeNull();
});

test("isExpiring: fresh → false; within skew or past expiry → true", () => {
  expect(isExpiring(cred({ expiresAt: Date.now() + 3_600_000 }))).toBe(false);
  expect(isExpiring(cred({ expiresAt: Date.now() + 30_000 }))).toBe(true); // within 2-min skew
  expect(isExpiring(cred({ expiresAt: Date.now() - 1_000 }))).toBe(true); // already expired
});

test("an api-key credential round-trips with its kind and never looks expiring", async () => {
  const s = new MemoryCredentialStore();
  const apiKeyCred = cred({
    provider: "openrouter",
    kind: "api_key",
    accessToken: "sk-or-v1-THEKEY",
    refreshToken: "",
    expiresAt: Number.MAX_SAFE_INTEGER,
  });
  await s.put(apiKeyCred);
  const got = await s.get("ws_1", "openrouter");
  if (!got) throw new Error("expected the stored openrouter credential");
  expect(got.kind).toBe("api_key");
  expect(got.accessToken).toBe("sk-or-v1-THEKEY");
  // Far-future expiry → /sandbox/credential never tries to refresh it (which
  // would throw — there is no OAuth refresh config for openrouter).
  expect(isExpiring(got)).toBe(false);
});

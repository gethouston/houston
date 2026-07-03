import { expect, test } from "vitest";
import { resolveSharedCredential } from "./resolve";
import { MemoryCredentialStore } from "./store";

test("returns the provider's own credential when it has one", async () => {
  const s = new MemoryCredentialStore();
  await s.put({
    workspaceId: "w1",
    provider: "opencode-go",
    accessToken: "sk-go",
    refreshToken: "",
    expiresAt: 0,
    kind: "api_key",
  });
  const c = await resolveSharedCredential(s, "w1", "opencode-go");
  expect(c).toMatchObject({ provider: "opencode-go", accessToken: "sk-go" });
});

test("falls back to a sibling's credential, relabeled to the requested provider", async () => {
  const s = new MemoryCredentialStore();
  // The user connected OpenCode Zen only; Go shares the same opencode.ai key.
  await s.put({
    workspaceId: "w1",
    provider: "opencode",
    accessToken: "sk-shared",
    refreshToken: "",
    expiresAt: 0,
    kind: "api_key",
  });
  const c = await resolveSharedCredential(s, "w1", "opencode-go");
  // The shared key resolves, RELABELED to the gateway the turn runs on.
  expect(c).toMatchObject({
    provider: "opencode-go",
    accessToken: "sk-shared",
    kind: "api_key",
  });
});

test("null when neither the provider nor a sibling is connected", async () => {
  const s = new MemoryCredentialStore();
  expect(await resolveSharedCredential(s, "w1", "opencode-go")).toBeNull();
});

test("does not cross-wire a provider that has no siblings", async () => {
  const s = new MemoryCredentialStore();
  await s.put({
    workspaceId: "w1",
    provider: "opencode",
    accessToken: "sk",
    refreshToken: "",
    expiresAt: 0,
    kind: "api_key",
  });
  // openrouter shares nothing with opencode — no accidental fallback.
  expect(await resolveSharedCredential(s, "w1", "openrouter")).toBeNull();
});

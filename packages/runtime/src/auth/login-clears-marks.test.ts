import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

// The data dir is pinned BEFORE the dynamic imports: the marks are persisted
// there and auth.json is written by the completed login.
process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-login-"));

// Never spawn the real Claude CLI from a test.
vi.mock("./anthropic-cli-binary", () => ({
  resolveClaudeCliBinary: () => null,
}));
// A fingerprint that CANNOT see the new credential — the macOS Keychain case,
// where the Claude CLI writes nothing the fingerprint reads. Without this the
// fingerprint change would heal the mark on its own and prove nothing.
vi.mock("./credential-fingerprint", () => ({
  credentialFingerprint: () => "absent|absent",
}));

const { authFailureActive, noteAuthFailure, resetAuthFailures } = await import(
  "./credential-health"
);
const { getAuthStatus, startLogin } = await import("./login");
const { modelRuntime } = await import("./storage");

test("a completed login clears the provider's stale auth-failure mark even when the fingerprint cannot see the new credential", async () => {
  noteAuthFailure("openai-codex");
  expect(authFailureActive("openai-codex")).toBe(true);

  const spy = vi.spyOn(modelRuntime, "getProvider").mockImplementation(
    (id: string) =>
      ({
        id,
        name: id,
        auth: {
          oauth: {
            name: id,
            login: async (
              interaction: import("@earendil-works/pi-ai").AuthInteraction,
            ) => {
              interaction.notify({
                type: "device_code",
                userCode: "ABCD-1234",
                verificationUri: "https://auth.example/device",
              });
              return {
                type: "oauth",
                access: "access",
                refresh: "refresh",
                expires: Date.now() + 60_000,
              };
            },
          },
        },
      }) as never,
  );
  try {
    await startLogin("openai-codex", true);
    await vi.waitFor(async () => {
      const row = (await getAuthStatus()).providers.find(
        (p) => p.provider === "openai-codex",
      );
      expect(row?.login?.status).toBe("complete");
    });
    expect(authFailureActive("openai-codex")).toBe(false);
  } finally {
    spy.mockRestore();
    resetAuthFailures();
  }
});

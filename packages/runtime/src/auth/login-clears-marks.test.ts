import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-login-"));

vi.mock("./anthropic-cli-binary", () => ({
  resolveClaudeCliBinary: () => null,
}));
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

import { beforeEach, expect, test, vi } from "vitest";
import { ApiKeyVerifyError } from "../auth/verify-errors";
import { loadLoginRunner } from "./login-runner";

const mocks = vi.hoisted(() => ({ assert: vi.fn(), verify: vi.fn() }));
vi.mock("../auth/login", () => ({
  startLogin: vi.fn(),
  getLoginStatus: vi.fn(),
  completeLogin: vi.fn(),
  cancelLogin: vi.fn(),
  assertApiKeyConnectable: mocks.assert,
  loginFailureMessage: (_provider: string, message: string) => message,
}));
vi.mock("../auth/export", () => ({ exportCredential: vi.fn() }));
vi.mock("../auth/verify-api-key", () => ({
  verifyApiKey: mocks.verify,
  ApiKeyVerifyError,
}));
beforeEach(() => {
  mocks.assert.mockReset().mockReturnValue("key-fixture");
  mocks.verify.mockReset().mockResolvedValue(undefined);
});

test("the lazy runner validates and probes the normalized Azure endpoint", async () => {
  const runner = await loadLoginRunner();
  const credential = await runner.apiKey(
    "azure-openai-responses",
    " key-fixture ",
    "https://resource.example/",
  );
  expect(mocks.assert).toHaveBeenCalledWith(
    "azure-openai-responses",
    " key-fixture ",
    "https://resource.example/",
  );
  expect(mocks.verify).toHaveBeenCalledWith(
    "azure-openai-responses",
    "key-fixture",
    {
      azureBaseUrl: "https://resource.example",
    },
  );
  expect(credential).toEqual({
    kind: "api_key",
    access: "key-fixture",
    refresh: "",
    expires: 0,
    enterpriseUrl: "https://resource.example",
  });
});

test.each(["invalid_key", "key_restricted", "provider_unavailable"] as const)(
  "verification preserves %s",
  async (reason) => {
    const runner = await loadLoginRunner();
    const failure = new ApiKeyVerifyError("verification refused", reason);
    mocks.verify.mockRejectedValue(failure);
    await expect(runner.apiKey("google", "key-fixture")).rejects.toBe(failure);
    expect(runner.failure("google", failure)).toEqual({
      error: "verification refused",
      reason,
    });
  },
);

test("typed login refusals retain their kind", async () => {
  const runner = await loadLoginRunner();
  expect(
    runner.failure(
      "google",
      Object.assign(new Error("refused"), { kind: "unsupported_provider" }),
    ),
  ).toEqual({ error: "refused", kind: "unsupported_provider" });
});

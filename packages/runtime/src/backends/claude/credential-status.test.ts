import { afterEach, expect, test, vi } from "vitest";
import {
  anthropicCredentialCached,
  refreshAnthropicCredential,
  resetAnthropicCredentialCache,
} from "./credential-status";

afterEach(() => {
  resetAnthropicCredentialCache(false);
  vi.restoreAllMocks();
});

test("a logged-in probe warms the cache", async () => {
  resetAnthropicCredentialCache(false);
  expect(await refreshAnthropicCredential(async () => true)).toBe(true);
  expect(anthropicCredentialCached()).toBe(true);
});

test("a logged-out probe reads as not connected", async () => {
  resetAnthropicCredentialCache(true);
  expect(await refreshAnthropicCredential(async () => false)).toBe(false);
  expect(anthropicCredentialCached()).toBe(false);
});

test("a failing probe reads as NOT connected and logs the reason (no silent failure)", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  resetAnthropicCredentialCache(true);
  const got = await refreshAnthropicCredential(async () => {
    throw new Error("claude spawn failed");
  });
  expect(got).toBe(false);
  expect(anthropicCredentialCached()).toBe(false);
  expect(warn).toHaveBeenCalled();
});

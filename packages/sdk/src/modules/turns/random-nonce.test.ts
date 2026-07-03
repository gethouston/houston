import { afterEach, expect, test, vi } from "vitest";
import { randomNonce } from "./random-nonce";

/**
 * The nonce util degrades through the capability chain (randomUUID →
 * getRandomValues → Math.random) instead of throwing on a runtime that lacks
 * `crypto.randomUUID` — the SDK ports doc bans reaching for that global raw, and
 * some embedded engines ship neither crypto primitive.
 */

afterEach(() => vi.restoreAllMocks());

test("prefers crypto.randomUUID when present", () => {
  const uuid = "11111111-2222-3333-4444-555555555555";
  vi.spyOn(crypto, "randomUUID").mockReturnValue(uuid);
  expect(randomNonce()).toBe(uuid);
});

test("falls back to getRandomValues hex when randomUUID is missing", () => {
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
    throw new Error("not a function here");
  });
  vi.spyOn(crypto, "getRandomValues").mockImplementation((arr) => {
    const u8 = arr as Uint8Array;
    u8.fill(0xab);
    return arr;
  });
  const n = randomNonce();
  expect(n).toBe("ab".repeat(16)); // 16 bytes → 32 hex chars, no dashes
  expect(n).not.toContain("-");
});

test("last-resort Math.random hex when no crypto primitive exists", () => {
  // Simulate a runtime where neither crypto primitive is callable.
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
    throw new Error("no randomUUID");
  });
  vi.spyOn(crypto, "getRandomValues").mockImplementation(() => {
    throw new Error("no getRandomValues");
  });
  const n = randomNonce();
  expect(typeof n).toBe("string");
  expect(n.length).toBeGreaterThan(0);
  expect(n).not.toContain("-");
});

test("produces distinct values across calls (real crypto)", () => {
  expect(randomNonce()).not.toBe(randomNonce());
});

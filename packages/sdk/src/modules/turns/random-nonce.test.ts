import { afterEach, expect, test, vi } from "vitest";
import { randomNonce } from "./random-nonce";

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
  expect(n).toBe("ab".repeat(16));
  expect(n).not.toContain("-");
});

test("last-resort Math.random hex when no crypto primitive exists", () => {
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

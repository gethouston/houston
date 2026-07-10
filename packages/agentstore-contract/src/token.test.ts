import { describe, expect, it } from "vitest";
import {
  hashManageToken,
  MANAGE_TOKEN_ALPHABET,
  MANAGE_TOKEN_LENGTH,
  MANAGE_TOKEN_PREFIX,
  newManageToken,
  timingSafeEqualHex,
} from "./token";

describe("newManageToken", () => {
  it("has the agst_ prefix and the expected length", () => {
    const token = newManageToken();
    expect(token.startsWith(MANAGE_TOKEN_PREFIX)).toBe(true);
    expect(token).toHaveLength(
      MANAGE_TOKEN_PREFIX.length + MANAGE_TOKEN_LENGTH,
    );
  });

  it("draws only from the unambiguous alphabet", () => {
    const body = newManageToken().slice(MANAGE_TOKEN_PREFIX.length);
    for (const ch of body) {
      expect(MANAGE_TOKEN_ALPHABET).toContain(ch);
    }
    // No visually ambiguous characters.
    expect(body).not.toMatch(/[0o1li]/);
  });

  it("is effectively unique across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(newManageToken());
    expect(seen.size).toBe(1000);
  });
});

describe("hashManageToken", () => {
  it("returns 64 lowercase hex chars", async () => {
    const hash = await hashManageToken("agst_example");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic and matches the known SHA-256 of the input", async () => {
    const a = await hashManageToken("hello");
    const b = await hashManageToken("hello");
    expect(a).toBe(b);
    // SHA-256("hello")
    expect(a).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("differs for different inputs", async () => {
    expect(await hashManageToken("a")).not.toBe(await hashManageToken("b"));
  });
});

describe("timingSafeEqualHex", () => {
  it("is true for equal strings", () => {
    expect(timingSafeEqualHex("deadbeef", "deadbeef")).toBe(true);
  });

  it("is false for different strings of equal length", () => {
    expect(timingSafeEqualHex("deadbeef", "deadbee0")).toBe(false);
  });

  it("is false on a length mismatch", () => {
    expect(timingSafeEqualHex("dead", "deadbeef")).toBe(false);
  });
});

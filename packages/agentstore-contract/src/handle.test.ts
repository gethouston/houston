import { describe, expect, it } from "vitest";
import { HANDLE_REGEX, normalizeHandle, RESERVED_HANDLES } from "./handle";

describe("HANDLE_REGEX", () => {
  it("accepts valid handles", () => {
    for (const h of [
      "ab",
      "a1",
      "0a",
      "felipe",
      "user_name",
      "a_",
      "abc123_xyz",
      "a".repeat(30),
      "9".repeat(30),
    ]) {
      expect(HANDLE_REGEX.test(h)).toBe(true);
    }
  });

  it("rejects invalid handles", () => {
    for (const h of [
      "", // empty
      "a", // too short (1 char)
      "a".repeat(31), // too long (31 chars)
      "_ab", // leading underscore
      "Ab", // uppercase
      "aB", // uppercase
      "ab c", // space
      "ab-c", // hyphen
      "@ab", // leading @ (must be normalized off first)
      "ab.c", // dot
      "ab!", // punctuation
      "áb", // non-ascii
    ]) {
      expect(HANDLE_REGEX.test(h)).toBe(false);
    }
  });
});

describe("normalizeHandle", () => {
  it("trims, strips one leading @, and lowercases", () => {
    expect(normalizeHandle("  Felipe  ")).toBe("felipe");
    expect(normalizeHandle("@Felipe")).toBe("felipe");
    expect(normalizeHandle("  @User_Name ")).toBe("user_name");
    expect(normalizeHandle("PLAIN")).toBe("plain");
  });

  it("strips only a single leading @", () => {
    expect(normalizeHandle("@@felipe")).toBe("@felipe");
  });

  it("does not touch a mid-string @", () => {
    expect(normalizeHandle("fe@lipe")).toBe("fe@lipe");
  });

  it("produces a valid handle from decorated input", () => {
    expect(HANDLE_REGEX.test(normalizeHandle("  @Felipe "))).toBe(true);
  });
});

describe("RESERVED_HANDLES", () => {
  it("contains the reserved product/route words (spot checks vs the Go list)", () => {
    for (const h of [
      "admin",
      "api",
      "houston",
      "gethouston",
      "me",
      "creator",
      "creators",
      "a",
      "c",
      "null",
      "undefined",
      "settings",
      "explore",
      "dashboard",
      "official",
      "verified",
    ]) {
      expect(RESERVED_HANDLES.has(h)).toBe(true);
    }
  });

  it("does not reserve ordinary handles", () => {
    for (const h of ["felipe", "user_name", "houston_fan", "team1"]) {
      expect(RESERVED_HANDLES.has(h)).toBe(false);
    }
  });

  it("has the exact Go reserved-list size (36 entries)", () => {
    expect(RESERVED_HANDLES.size).toBe(36);
  });
});

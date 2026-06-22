import { describe, expect, it } from "vitest";
import { normalizeCountry } from "../src/capture-country";

describe("normalizeCountry", () => {
  it("upper-cases a valid two-letter code", () => {
    expect(normalizeCountry("us")).toBe("US");
    expect(normalizeCountry("Mx")).toBe("MX");
    expect(normalizeCountry("GB")).toBe("GB");
  });

  it("maps Cloudflare unknown/Tor sentinels to null", () => {
    expect(normalizeCountry("XX")).toBeNull();
    expect(normalizeCountry("xx")).toBeNull();
    expect(normalizeCountry("T1")).toBeNull();
    expect(normalizeCountry("t1")).toBeNull();
  });

  it("maps empty / missing to null", () => {
    expect(normalizeCountry("")).toBeNull();
    expect(normalizeCountry(undefined)).toBeNull();
    expect(normalizeCountry(null)).toBeNull();
  });

  it("rejects malformed codes rather than storing junk", () => {
    expect(normalizeCountry("USA")).toBeNull();
    expect(normalizeCountry("U")).toBeNull();
    expect(normalizeCountry("12")).toBeNull();
    expect(normalizeCountry("u1")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { slugCandidates } from "./publish";

describe("slugCandidates", () => {
  it("yields the base first, then -2, -3 … suffixes", () => {
    const out = [...slugCandidates("cool-agent", 4)];
    expect(out).toEqual([
      "cool-agent",
      "cool-agent-2",
      "cool-agent-3",
      "cool-agent-4",
    ]);
  });

  it("skips a reserved base and starts at the suffix", () => {
    const out = [...slugCandidates("admin", 3)];
    expect(out).toEqual(["admin-2", "admin-3"]);
  });

  it("skips a reserved base whose suffixes are free (me)", () => {
    const out = [...slugCandidates("me", 3)];
    expect(out[0]).toBe("me-2");
    expect(out).not.toContain("me");
  });

  it("respects the maxAttempts ceiling for a non-reserved base", () => {
    expect([...slugCandidates("helper", 5)]).toHaveLength(5);
  });
});

import { describe, expect, it } from "vitest";
import { isReservedSlug, RESERVED_SLUGS } from "./reserved-slugs";

describe("reserved slugs", () => {
  it("reserves the app's route-colliding words", () => {
    for (const slug of ["a", "api", "claim", "schema", "admin"]) {
      expect(isReservedSlug(slug)).toBe(true);
    }
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(isReservedSlug("  API ")).toBe(true);
  });

  it("does not reserve ordinary agent slugs", () => {
    expect(isReservedSlug("inbox-triage-helper")).toBe(false);
    expect(RESERVED_SLUGS.has("inbox-triage-helper")).toBe(false);
  });
});

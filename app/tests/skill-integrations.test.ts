import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { skillIntegrationSlugs } from "../src/lib/skill-integrations.ts";

describe("skillIntegrationSlugs", () => {
  it("keeps already-clean slugs in author order", () => {
    deepStrictEqual(skillIntegrationSlugs(["gmail", "slack", "notion"]), [
      "gmail",
      "slack",
      "notion",
    ]);
  });

  it("lowercases author casing so the toolkit catalog resolves", () => {
    deepStrictEqual(skillIntegrationSlugs(["Gmail", "GOOGLEDOCS"]), [
      "gmail",
      "googledocs",
    ]);
  });

  it("trims padding from a hand-written YAML list", () => {
    deepStrictEqual(skillIntegrationSlugs([" gmail ", "\tslack\n"]), [
      "gmail",
      "slack",
    ]);
  });

  it("drops blanks and whitespace-only entries", () => {
    deepStrictEqual(skillIntegrationSlugs(["", "   ", "gmail"]), ["gmail"]);
  });

  it("dedupes case/padding variants, keeping the first occurrence", () => {
    deepStrictEqual(skillIntegrationSlugs(["Gmail", "gmail", " GMAIL "]), [
      "gmail",
    ]);
  });

  it("returns an empty list for a skill that declares none", () => {
    deepStrictEqual(skillIntegrationSlugs([]), []);
    deepStrictEqual(skillIntegrationSlugs(undefined), []);
    deepStrictEqual(skillIntegrationSlugs(null), []);
  });

  it("skips non-string entries a YAML list can carry", () => {
    // `integrations: [1, gmail]` parses the first entry as a number.
    const raw = [1, "gmail"] as unknown as string[];
    deepStrictEqual(skillIntegrationSlugs(raw), ["gmail"]);
  });
});

import { describe, expect, it } from "vitest";
import { applyCatalogLabels, humanizeIntegrationSlug } from "./integrations";

describe("humanizeIntegrationSlug", () => {
  it("renders WRONG brand casing for real concatenated Composio slugs (the defect)", () => {
    // Real toolkit slugs are single tokens with no separators, so title-casing
    // in isolation cannot recover multi-word brand casing.
    expect(humanizeIntegrationSlug("GITHUB")).toBe("Github");
    expect(humanizeIntegrationSlug("YOUTUBE")).toBe("Youtube");
    expect(humanizeIntegrationSlug("LINKEDIN")).toBe("Linkedin");
    expect(humanizeIntegrationSlug("GOOGLECALENDAR")).toBe("Googlecalendar");
  });
});

describe("applyCatalogLabels", () => {
  const catalog = new Map([
    ["GITHUB", "GitHub"],
    ["YOUTUBE", "YouTube"],
    ["LINKEDIN", "LinkedIn"],
    ["GOOGLECALENDAR", "Google Calendar"],
  ]);

  it("uses the seeded catalog name so brands render with correct casing (the fix)", () => {
    expect(
      applyCatalogLabels(
        ["GOOGLECALENDAR", "GITHUB", "LINKEDIN", "YOUTUBE"],
        catalog,
      ),
    ).toEqual([
      { slug: "GOOGLECALENDAR", label: "Google Calendar" },
      { slug: "GITHUB", label: "GitHub" },
      { slug: "LINKEDIN", label: "LinkedIn" },
      { slug: "YOUTUBE", label: "YouTube" },
    ]);
  });

  it("preserves input order and humanizes slugs absent from the catalog", () => {
    expect(applyCatalogLabels(["GITHUB", "MYSTERYTOOL"], catalog)).toEqual([
      { slug: "GITHUB", label: "GitHub" },
      { slug: "MYSTERYTOOL", label: "Mysterytool" },
    ]);
  });
});

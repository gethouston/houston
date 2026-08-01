import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  applyCatalogLabels,
  humanizeIntegrationSlug,
} from "../src/integrations.ts";

describe("integration labels", () => {
  it("humanizes unknown slugs", () => {
    assert.equal(humanizeIntegrationSlug("GOOGLE_CALENDAR"), "Google Calendar");
  });

  it("uses curated brand names and preserves input order", () => {
    const catalog = new Map([
      ["GITHUB", "GitHub"],
      ["YOUTUBE", "YouTube"],
    ]);
    assert.deepEqual(
      applyCatalogLabels(["YOUTUBE", "GITHUB", "MYSTERYTOOL"], catalog),
      [
        { slug: "YOUTUBE", label: "YouTube" },
        { slug: "GITHUB", label: "GitHub" },
        { slug: "MYSTERYTOOL", label: "Mysterytool" },
      ],
    );
  });
});

import { deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  employeeNamePlaceholder,
  fittingNamePlaceholder,
} from "../src/components/employee-card/employee-name-placeholder.ts";

describe("employee name placeholder", () => {
  it("leads with the job when the card knows it", () => {
    deepStrictEqual(employeeNamePlaceholder("Branch manager"), {
      key: "employeeCard.namePlaceholderForRole",
      values: { role: "Branch manager" },
    });
    deepStrictEqual(employeeNamePlaceholder("  Personal banker "), {
      key: "employeeCard.namePlaceholderForRole",
      values: { role: "Personal banker" },
    });
  });

  it("shows the examples alone with no job to go on", () => {
    const generic = { key: "employeeCard.namePlaceholder" };
    deepStrictEqual(employeeNamePlaceholder(undefined), generic);
    deepStrictEqual(employeeNamePlaceholder(""), generic);
    deepStrictEqual(employeeNamePlaceholder("   "), generic);
  });

  it("keeps the job only when its examples fit the field whole", () => {
    const forRole = employeeNamePlaceholder("Agronomy advisor");
    const generic = { key: "employeeCard.namePlaceholder" };
    deepStrictEqual(fittingNamePlaceholder(forRole, 250, 300), forRole);
    deepStrictEqual(fittingNamePlaceholder(forRole, 298, 300), forRole);
    deepStrictEqual(fittingNamePlaceholder(forRole, 299, 300), generic);
    deepStrictEqual(fittingNamePlaceholder(forRole, 320, 300), generic);
  });

  it("falls back to the examples alone before the field is measured", () => {
    const forRole = employeeNamePlaceholder("Branch manager");
    deepStrictEqual(
      fittingNamePlaceholder(forRole, Number.POSITIVE_INFINITY, 0),
      { key: "employeeCard.namePlaceholder" },
    );
  });
});

describe("narrow badge name fields", () => {
  it("uses a short localized example when role examples exceed the phone field", () => {
    const fallback = fittingNamePlaceholder(
      employeeNamePlaceholder("Executive assistant"),
      340,
      178,
    );
    for (const language of ["en", "es", "pt"]) {
      const copy = JSON.parse(
        readFileSync(
          new URL(`../src/locales/${language}/shell.json`, import.meta.url),
          "utf8",
        ),
      ) as { employeeCard: { namePlaceholder: string } };
      deepStrictEqual(fallback.key, "employeeCard.namePlaceholder");
      deepStrictEqual(copy.employeeCard.namePlaceholder.length <= 12, true);
    }
  });
});

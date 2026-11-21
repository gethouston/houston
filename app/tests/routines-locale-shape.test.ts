import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import en from "../src/locales/en/routines.json" with { type: "json" };
import es from "../src/locales/es/routines.json" with { type: "json" };
import pt from "../src/locales/pt/routines.json" with { type: "json" };

const INTERVAL_UNITS = ["minutes", "hours", "days", "months"] as const;
const LOCALES = { en, es, pt } as const;

describe("routines schedule unit labels are flat strings, not plural objects", () => {
  for (const [lang, bundle] of Object.entries(LOCALES)) {
    const schedule = (bundle as { schedule: Record<string, unknown> }).schedule;
    for (const group of ["units", "unitsSingular"] as const) {
      it(`${lang}: schedule.${group} maps every interval unit to a string`, () => {
        const record = schedule[group] as Record<string, unknown>;
        for (const unit of INTERVAL_UNITS) {
          ok(unit in record, `${lang}: schedule.${group}.${unit} is missing`);
          strictEqual(
            typeof record[unit],
            "string",
            `${lang}: schedule.${group}.${unit} must be a string, got ${JSON.stringify(record[unit])}`,
          );
        }
      });
    }
  }
});

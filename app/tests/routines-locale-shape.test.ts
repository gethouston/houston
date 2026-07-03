import { ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import en from "../src/locales/en/routines.json" with { type: "json" };
import es from "../src/locales/es/routines.json" with { type: "json" };
import pt from "../src/locales/pt/routines.json" with { type: "json" };

// The `ui/routines` IntervalPicker types `units` / `unitsSingular` as
// Record<IntervalUnit, string> and renders `plural ? units[u] : unitsSingular[u]`
// straight into JSX. The app sources these labels via
// `t("schedule", { returnObjects: true })`, so a value authored as an OBJECT
// (e.g. an i18next `{ one, other }` plural) instead of a flat string is handed
// to React as a child and crashes the whole app:
//   "Objects are not valid as a React child (found: object with keys
//    {one, other})."
// (regression guard — the plural-object crash in the custom schedule builder.)
// Keep the unit labels flat strings; per-count wording is chosen in `ui/` by
// switching between `unitsSingular` (count 1) and `units` (count > 1).

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

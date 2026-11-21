import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_SCHEDULE_LABELS } from "../src/labels.ts";
import {
  type BuilderPick,
  builderEmits,
  builderOutput,
  builderSummary,
} from "../src/schedule-builder-output.ts";

const custom = (
  intervalEvery: string,
  intervalUnit: BuilderPick["intervalUnit"],
): BuilderPick => ({
  activePreset: "custom",
  options: { time: "09:00", daysOfWeek: [1], dayOfMonth: 1 },
  intervalEvery,
  intervalUnit,
});

const summary = (
  pick: BuilderPick,
  saved: { touched: boolean; value: string },
) =>
  builderSummary(
    pick,
    builderOutput(pick),
    saved,
    DEFAULT_SCHEDULE_LABELS,
    "en-US",
  );

describe("builderEmits", () => {
  it("writes nothing over a saved schedule until the person edits", () => {
    assert.equal(builderEmits(false, "*/16 * * * *"), false);
    assert.equal(builderEmits(false, "0 */5 * * *"), false);
    assert.equal(builderEmits(true, "*/16 * * * *"), true);
  });

  it("writes the default pick at once when there is no schedule yet", () => {
    assert.equal(builderEmits(false, ""), true);
    assert.equal(builderEmits(false, "  "), true);
  });
});

describe("builderOutput", () => {
  it("writes the interval form for an uneven count", () => {
    const out = builderOutput(custom("16", "minutes"));
    assert.deepEqual(out, {
      everyValid: true,
      overMax: false,
      weeklyValid: true,
      floorOk: true,
      picked: "@every 16m",
      schedule: "@every 16m",
    });
  });

  it("writes nothing for a count over the unit's maximum, and says so", () => {
    for (const [every, unit] of [
      ["10081", "minutes"],
      ["169", "hours"],
      ["32", "days"],
      ["13", "months"],
    ] as const) {
      const out = builderOutput(custom(every, unit));
      assert.equal(out.everyValid, false, `${every} ${unit}`);
      assert.equal(out.overMax, true, `${every} ${unit}`);
      assert.equal(out.schedule, "", `${every} ${unit}`);
    }
  });

  it("an empty count is invalid but not over the maximum", () => {
    const out = builderOutput(custom("", "minutes"));
    assert.equal(out.everyValid, false);
    assert.equal(out.overMax, false);
    assert.equal(out.schedule, "");
  });
});

describe("builderSummary", () => {
  it("describes the saved schedule while untouched", () => {
    const untouched = (value: string) => ({ touched: false, value });
    assert.equal(
      summary(custom("16", "minutes"), untouched("*/16 * * * *")),
      "Runs every 16 minutes",
    );
    assert.equal(
      summary(custom("5", "hours"), untouched("0 */5 * * *")),
      "Runs every 5 hours",
    );
  });

  it("names the unit's maximum when the count is over it", () => {
    const touched = { touched: true, value: "" };
    assert.equal(
      summary(custom("10081", "minutes"), touched),
      "Enter 10,080 minutes or less",
    );
    assert.equal(
      summary(custom("200", "hours"), touched),
      "Enter 168 hours or less",
    );
    assert.equal(
      summary(custom("32", "days"), touched),
      "Enter 31 days or less",
    );
    assert.equal(summary(custom("", "days"), touched), "Enter a number");
  });

  it("formats the maximum for the locale", () => {
    const pick = custom("10081", "minutes");
    const es = builderSummary(
      pick,
      builderOutput(pick),
      { touched: true, value: "" },
      { ...DEFAULT_SCHEDULE_LABELS, maxInterval: "Hasta {max} {unit}" },
      "es-ES",
    );
    assert.equal(
      es,
      `Hasta ${new Intl.NumberFormat("es-ES").format(10080)} minutes`,
    );
  });
});

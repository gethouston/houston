import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { headerMode } from "../src/components/shell/page-header/page-header-layout.ts";
import {
  TEAM_STRIP_COMPACT_MIN,
  TEAM_STRIP_ONE_ROW_MIN,
  TEAM_STRIP_THRESHOLDS,
} from "../src/components/team-view/team-chrome-layout.ts";

/** The team's measured thresholds stay pinned separately from generic rules. */
describe("team strip thresholds", () => {
  it("takes the full cluster only from the measured one-row minimum", () => {
    assert.equal(
      headerMode(TEAM_STRIP_ONE_ROW_MIN - 1, TEAM_STRIP_THRESHOLDS),
      "compact",
    );
    assert.equal(
      headerMode(TEAM_STRIP_ONE_ROW_MIN, TEAM_STRIP_THRESHOLDS),
      "full",
    );
  });

  it("collapses tabs before stacking tools", () => {
    assert.equal(
      headerMode(TEAM_STRIP_COMPACT_MIN, TEAM_STRIP_THRESHOLDS),
      "compact",
    );
    assert.equal(
      headerMode(TEAM_STRIP_COMPACT_MIN - 1, TEAM_STRIP_THRESHOLDS),
      "stacked",
    );
    assert.ok(TEAM_STRIP_COMPACT_MIN < TEAM_STRIP_ONE_ROW_MIN);
  });

  it("pays for the measured clusters, chrome, and upward rounding", () => {
    assert.ok(TEAM_STRIP_ONE_ROW_MIN >= 521 + 474 + 40 + 12);
    assert.ok(TEAM_STRIP_COMPACT_MIN >= 180 + 474 + 40 + 12);
  });
});

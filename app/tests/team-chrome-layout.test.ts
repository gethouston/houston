import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { headerMode } from "../src/components/shell/page-header/page-header-layout.ts";
import {
  TEAM_STRIP_ONE_ROW_MIN,
  TEAM_STRIP_THRESHOLDS,
} from "../src/components/team-view/team-chrome-layout.ts";

describe("team strip thresholds", () => {
  it("takes the one-row form only from the measured minimum", () => {
    assert.equal(
      headerMode(TEAM_STRIP_ONE_ROW_MIN - 1, TEAM_STRIP_THRESHOLDS),
      "stacked",
    );
    assert.equal(
      headerMode(TEAM_STRIP_ONE_ROW_MIN, TEAM_STRIP_THRESHOLDS),
      "full",
    );
  });

  it("pays for the measured clusters, chrome, and upward rounding", () => {
    assert.ok(TEAM_STRIP_ONE_ROW_MIN >= 521 + 474 + 40 + 12);
  });

  it("keeps the employee's sections drawn as tabs at every desktop width", () => {
    const chrome = readFileSync(
      new URL("../src/components/team-view/agent-chrome.tsx", import.meta.url),
      "utf8",
    );
    assert.ok(chrome.includes("<PageHeaderTabs"), "the cluster is tabs");
    assert.ok(!chrome.includes("PageHeaderSwitcher"), "and never a menu");
  });
});

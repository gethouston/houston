import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const PILL = readFileSync(
  new URL("../src/components/shell/update-pill.tsx", import.meta.url),
  "utf8",
);

describe("sidebar update pill", () => {
  it("fills the expanded footer and shows the downloaded version", () => {
    assert.ok(PILL.includes('collapsed ? "size-8 shrink-0" : "min-h-8 w-full'));
    assert.ok(PILL.includes("{!collapsed && <span>{label}</span>}"));
    assert.ok(PILL.includes("{!collapsed && !failed && !installing && ("));
    assert.ok(PILL.includes("v{status.info.version}"));
  });

  it("names and describes the collapsed icon action with a tooltip", () => {
    assert.ok(PILL.includes("aria-label={collapsed ? label : undefined}"));
    assert.ok(PILL.includes("aria-describedby={hintId}"));
    assert.ok(
      PILL.includes("<TooltipTrigger asChild>{button}</TooltipTrigger>"),
    );
    assert.ok(PILL.includes('<TooltipContent side="right" sideOffset={8}>'));
    assert.ok(PILL.includes('<span id={hintId} className="sr-only">'));
    assert.ok(PILL.includes("{hint}"));
  });

  it("keeps restart, progress, and retry states on the same action", () => {
    assert.ok(PILL.includes('t("updateChecker.restartAction")'));
    assert.ok(PILL.includes('t("updateChecker.restarting")'));
    assert.ok(PILL.includes('t("updateChecker.retryUpdateAction")'));
    assert.ok(PILL.includes("disabled={installing}"));
    assert.ok(PILL.includes("{installing ? ("));
    assert.ok(PILL.includes("animate-spin motion-reduce:animate-none"));
  });
});

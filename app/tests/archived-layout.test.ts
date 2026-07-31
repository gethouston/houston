import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  KANBAN_LIST_RAIL_CLASS_NAME,
  KANBAN_LIST_RAIL_LEFT_CLASS_NAME,
} from "../../ui/board/src/kanban-list-layout.ts";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const headerSource = read("../src/components/tabs/archived-header.tsx");
const tabSource = read("../src/components/tabs/archived-tab.tsx");
const boardTabSource = read("../src/components/tabs/board-tab.tsx");
const toolbarSource = read("../src/components/mission-control-toolbar.tsx");
const mcArchivedSource = read(
  "../src/components/board/mission-control-archived.tsx",
);
const backButtonSource = read("../src/components/board/board-back-button.tsx");
const entryButtonSource = read(
  "../src/components/shell/archived-board-button.tsx",
);

describe("archived mission layout", () => {
  it("keeps a centered column and a full-width left rail variant", () => {
    strictEqual(KANBAN_LIST_RAIL_CLASS_NAME, "mx-auto w-full max-w-2xl");
    // The Archived (left) rail drops the max-w cap so cards fill the pane and
    // shrink with it when the chat panel opens.
    strictEqual(KANBAN_LIST_RAIL_LEFT_CLASS_NAME, "w-full");
  });

  it("left-aligns the archived list and its header on the shared rail", () => {
    ok(
      headerSource.includes(
        'import { KanbanListRail } from "@houston-ai/board";',
      ),
    );
    ok(headerSource.includes('<KanbanListRail align="left">'));
    ok(tabSource.includes('listAlign="left"'));
  });
});

/**
 * HOU-1043: the way into the archive and the way back out both have to be
 * readable at a glance, and identical across the per-agent tab and Mission
 * Control. These assertions pin the shape that guarantees it.
 */
describe("archived return path", () => {
  it("shares one labelled back control across both archived surfaces", () => {
    // Text label, not an icon-only button whose name hides on a tooltip.
    ok(backButtonSource.includes("{label}"));
    ok(!backButtonSource.includes("Tooltip"));
    ok(headerSource.includes("<BoardBackButton"));
    ok(toolbarSource.includes("<BoardBackButton"));
    ok(mcArchivedSource.includes("onBack={onShowActive}"));
  });

  it("renders the archived header, and its exit, unconditionally", () => {
    // No early return and no visibility gate: an EMPTY archive must still
    // show the way home. Only the search field is conditional.
    ok(!headerSource.includes("return null"));
    ok(headerSource.includes("{searchable && ("));
  });

  it("keeps the archived entry pill labelled and out of the archive", () => {
    ok(entryButtonSource.includes("{label}"));
    ok(!entryButtonSource.includes("Tooltip"));
    // Entry lives on the ACTIVE branch only, so it can never double as a
    // mystery exit the way the old ring-highlighted toggle did.
    const activeBranch = boardTabSource.slice(boardTabSource.indexOf(") : ("));
    ok(activeBranch.includes("<ArchivedBoardButton"));
    ok(boardTabSource.includes("onBack={showActive}"));
  });
});

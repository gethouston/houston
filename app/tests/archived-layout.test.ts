import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  KANBAN_LIST_RAIL_CLASS_NAME,
  KANBAN_LIST_RAIL_LEFT_CLASS_NAME,
} from "../../ui/board/src/kanban-list-layout.ts";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const toolbarSource = read("../src/components/mission-control-toolbar.tsx");
const actionsSource = read("../src/components/mission-toolbar-actions.tsx");
const archivedSource = read(
  "../src/components/board/mission-control-archived.tsx",
);
const backButtonSource = read("../src/components/board/board-back-button.tsx");
const handoffSource = read("../src/hooks/use-archived-handoff.ts");

// There is ONE archive now — the cross-agent one, rendered by the global board
// and by every team's. The per-agent Archived tab went away with the agent tab
// shell, so these pin the shape on the surface that survived.

describe("archived mission layout", () => {
  it("keeps a centered column and a full-width left rail variant", () => {
    strictEqual(KANBAN_LIST_RAIL_CLASS_NAME, "mx-auto w-full max-w-2xl");
    // The Archived (left) rail drops the max-w cap so cards fill the pane and
    // shrink with it when the chat panel opens.
    strictEqual(KANBAN_LIST_RAIL_LEFT_CLASS_NAME, "w-full");
  });

  it("left-aligns the archived list", () => {
    ok(archivedSource.includes('listAlign="left"'));
  });
});

/**
 * HOU-1043: the way into the archive and the way back out both have to be
 * readable at a glance. These assertions pin the shape that guarantees it.
 */
describe("archived return path", () => {
  it("uses one labelled back control, never an icon-only mystery", () => {
    // Text label, not an icon-only button whose name hides on a tooltip.
    ok(backButtonSource.includes("{label}"));
    ok(!backButtonSource.includes("Tooltip"));
    ok(toolbarSource.includes("<BoardBackButton"));
    ok(archivedSource.includes("onBack={onShowActive}"));
  });

  it("keeps the archived ENTRY out of the archive itself", () => {
    // The entry pill is opt-in by callback, and the archive's own toolbar
    // never passes it — so it can never double as a mystery exit.
    ok(actionsSource.includes("{onShowArchived && ("));
    ok(!archivedSource.includes("onShowArchived="));
  });

  it("hands a re-activated mission back to THIS screen's board", () => {
    // A send inside an archived chat re-activates the mission, so the user has
    // to move with it — to the board they came from, never to some other
    // screen: `focusBoard` is the caller's own "show the active board".
    ok(handoffSource.includes("focusBoard();"));
    ok(handoffSource.includes("setActivityPanelId(id, { forceOpen: true })"));
    ok(
      !handoffSource.includes("setViewMode"),
      "the handoff never picks a screen of its own",
    );
    ok(
      archivedSource.includes(
        "useMissionControlArchivedPanel(data, onShowActive)",
      ),
    );
  });
});

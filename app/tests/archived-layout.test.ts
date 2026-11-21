import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  KANBAN_LIST_RAIL_CLASS_NAME,
  KANBAN_LIST_RAIL_LEFT_CLASS_NAME,
} from "../../ui/board/src/kanban-list-layout.ts";
import { visibleAgentSections } from "../src/lib/team-sections.ts";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const toolbarSource = read("../src/components/mission-control-toolbar.tsx");
const archivedSource =
  read("../src/components/board/mission-control-archived.tsx") +
  read("../src/components/board/archived-mission-board.tsx");
const archivedSectionSource = read(
  "../src/components/team-view/team-archived.tsx",
);
const missionControlSource = read(
  "../src/components/team-view/team-mission-control.tsx",
);
const handoffSource = read("../src/hooks/use-archived-handoff.ts");

describe("archived mission layout", () => {
  it("keeps a centered column and a full-width left rail variant", () => {
    strictEqual(KANBAN_LIST_RAIL_CLASS_NAME, "mx-auto w-full max-w-2xl");
    strictEqual(KANBAN_LIST_RAIL_LEFT_CLASS_NAME, "w-full");
  });

  it("left-aligns the archived list", () => {
    ok(archivedSource.includes('listAlign="left"'));
  });
});

describe("archived is a labelled tab, and the only door", () => {
  it("is a mode of Tasks, never a section", () => {
    const member = visibleAgentSections(
      { multiplayer: true, role: "user" } as never,
      { access: "user" },
    );
    ok(!member.includes("archived" as never));
    const admin = visibleAgentSections(null, {});
    ok(!admin.includes("archived" as never));
  });

  it("carries no entry pill and no overflow: the tab IS the entry", () => {
    ok(!toolbarSource.includes("onShowArchived"));
    ok(!toolbarSource.includes("DropdownMenu"));
    ok(!toolbarSource.includes("lucide-react"));
  });

  it("carries no back button: the Tasks tab IS the exit", () => {
    ok(!toolbarSource.includes("BoardBackButton"));
    ok(!archivedSource.includes("onBack="));
  });

  it("never names itself on screen: the lit tab already did", () => {
    ok(!archivedSource.includes("archived.title"));
    ok(!archivedSource.includes("TeamChromeSlot"));
  });

  it("keeps the pending-target discipline, as a section change", () => {
    ok(missionControlSource.includes("useBoardSurfaceOnNav"));
    ok(archivedSectionSource.includes("useBoardSurfaceOnNav"));
    ok(missionControlSource.includes("setArchived(true)"));
    ok(archivedSectionSource.includes("onShowActive"));
  });

  it("hands a re-activated mission back to the Tasks section", () => {
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

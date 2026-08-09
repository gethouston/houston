import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  KANBAN_LIST_RAIL_CLASS_NAME,
  KANBAN_LIST_RAIL_LEFT_CLASS_NAME,
} from "../../ui/board/src/kanban-list-layout.ts";
import { visibleTeamSectionsForTeam } from "../src/lib/team-sections.ts";
import type { TeamView } from "../src/lib/teams-model.ts";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const toolbarSource = read("../src/components/mission-control-toolbar.tsx");
const archivedSource = read(
  "../src/components/board/mission-control-archived.tsx",
);
const archivedSectionSource = read(
  "../src/components/team-view/team-archived.tsx",
);
const missionControlSource = read(
  "../src/components/team-view/team-mission-control.tsx",
);
const handoffSource = read("../src/hooks/use-archived-handoff.ts");

// There is ONE archive: the cross-agent one, and it is a team SECTION now
// rather than a mode the Tasks board swaps into.

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
 * HOU-1043, restated for the shape that replaced it.
 *
 * The RULE has never changed: the way into the archive and the way back out
 * must both be readable at a glance, never an icon-only mystery whose meaning
 * hides in a tooltip. What changed is that the archive is a SECTION, so a
 * LABELLED TAB is both doors at once — it is always on screen, always says
 * "Archived" in words, and it wears `aria-current` while you are there. That
 * satisfies the rule better than the pill-in / back-button-out pair did: the
 * old pair was two controls for one place, and only one of them was visible at
 * a time.
 *
 * So the assertions below pin the tab's EXISTENCE for every caller, and the
 * absence of every piece of the old chrome — because each of those pieces
 * would now be a second, quieter way to say what the tab already says.
 */
describe("archived is a labelled tab, and the only door", () => {
  const team = (): TeamView => ({
    id: "t1",
    name: "Marketing",
    agents: [],
    isDefault: false,
  });

  it("is a section every caller gets, ordered last before Manage agents", () => {
    // The archive is the team's WORK in the past tense, never something you
    // need a role to read: only Settings is gated.
    const member = visibleTeamSectionsForTeam(
      { multiplayer: true, role: "user" } as never,
      team(),
    );
    ok(member.includes("archived"));
    ok(!member.includes("settings"));
    ok(member.indexOf("archived") > member.indexOf("files"));
    ok(member.at(-1) === "archived");

    const admin = visibleTeamSectionsForTeam(null, team());
    ok(admin.indexOf("archived") === admin.indexOf("settings") - 1);
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
    // No title, no "· Archived" qualifier, no breadcrumb segment. Three ways
    // of saying one word is two too many.
    ok(!archivedSource.includes("archived.title"));
    ok(!archivedSource.includes("TeamChromeSlot"));
  });

  it("keeps the pending-target discipline, as a section change", () => {
    // The surface a published target needs is still decided from the RAW sweep
    // rows, and the section that cannot show it still hands it over — only the
    // act changed, from a mode flip to `openTeamView`.
    ok(missionControlSource.includes("useBoardSurfaceOnNav"));
    ok(archivedSectionSource.includes("useBoardSurfaceOnNav"));
    ok(missionControlSource.includes('openTeamView(team.id, "archived"'));
    ok(
      archivedSectionSource.includes('openTeamView(team.id, "mission-control"'),
    );
  });

  it("hands a re-activated mission back to the Tasks section", () => {
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

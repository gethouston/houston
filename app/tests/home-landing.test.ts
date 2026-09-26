import { deepStrictEqual, ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { homeDestination } from "../src/lib/home-destination.ts";

const src = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

// Home is where the app opens. The desktop opens on the first employee's
// Tasks screen; the Agents home is the phone's Agents tab root and the
// desktop's screen only while nothing can be opened yet.
describe("homeDestination", () => {
  const ready = { isMobile: false, rosterReady: true, firstAgentId: "c" };

  it("opens the first employee in sidebar order on the desktop", () => {
    deepStrictEqual(homeDestination(ready), { kind: "agent", agentId: "c" });
  });

  it("stays on the Agents home on the phone", () => {
    deepStrictEqual(homeDestination({ ...ready, isMobile: true }), {
      kind: "agents-home",
    });
  });

  it("stays on the Agents home while the roster or layout resolves", () => {
    // The boot landing finishes the move once both reads settle, in rail order.
    deepStrictEqual(homeDestination({ ...ready, rosterReady: false }), {
      kind: "agents-home",
    });
  });

  it("stays on the Agents home for an empty roster", () => {
    deepStrictEqual(homeDestination({ ...ready, firstAgentId: null }), {
      kind: "agents-home",
    });
  });
});

describe("home and compose wiring", () => {
  it("openHome resolves its destination through the shared rule", () => {
    const home = src("lib/home-nav.ts");
    ok(home.includes("homeDestination("));
    ok(home.includes("firstSidebarAgentId("));
    ok(home.includes("isSidebarLayoutSettled("));
  });

  it("the dead-view guard goes home through openHome", () => {
    const guard = src("components/shell/use-workspace-view-guards.ts");
    ok(guard.includes('openHome({ nav: "replace" })'));
    ok(!guard.includes("setViewMode(AGENTS_HOME_VIEW_ID"));
  });

  it("the boot landing reads the same first employee", () => {
    const guard = src("components/shell/use-workspace-view-guards.ts");
    ok(guard.includes("firstAgentId: firstSidebarAgentId(agents, layout)"));
  });

  it("the palette's New task composes through the shared startNewMission", () => {
    const palette = src("components/command-palette.tsx");
    ok(palette.includes('from "../lib/new-mission"'));
    ok(!palette.includes("onStartMission"));
  });

  it("the lesson's Tasks beat opens a board with a New task button", () => {
    const lesson = src("components/academy/lessons/use-lesson-run.ts");
    ok(lesson.includes("openComposeBoard()"));
    ok(!lesson.includes("openHome"));
  });

  it("compose and hands-on errands pick the employee in sidebar order", () => {
    const open = src("lib/open-agent.ts");
    ok(open.includes("workingAgentId("));
    ok(open.includes("getCurrentSidebarLayout("));
    const handsOn = src("lib/hands-on-navigation.ts");
    ok(handsOn.includes("currentWorkingAgentId()"));
    ok(!handsOn.includes("flatSidebarOrder"));
  });
});

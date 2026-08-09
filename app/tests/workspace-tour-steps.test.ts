import assert from "node:assert/strict";
import test from "node:test";
import type { Capabilities } from "@houston-ai/engine-client";
import type { WorkspaceTourArgs } from "../src/components/shell/workspace-tour.ts";
import { workspaceTourSteps } from "../src/components/shell/workspace-tour.ts";
import {
  RAIL_ANCHORED,
  TOUR_TARGETS,
  tourSelector,
  tourTargetName,
} from "../src/components/shell/workspace-tour-steps.ts";

/**
 * The tour must never spotlight nothing. Every anchor it can't reach has to be
 * filtered while the list is BUILT (a missing target only stalls `UiTour`'s
 * retry loop and then renders a centered card describing a row nobody can see).
 *
 * These build the real step list against a pass-through `t()` and assert on the
 * selectors, which is exactly what `UiTour` queries.
 */
const t = ((key: string) => key) as unknown as WorkspaceTourArgs["t"];

const SPACES_CAPS = { spaces: true } as unknown as Capabilities;

function build(overrides: Partial<WorkspaceTourArgs> = {}): string[] {
  return workspaceTourSteps({
    t,
    capabilities: SPACES_CAPS,
    showAiModels: true,
    showOrganization: true,
    tourTeamId: "team-1",
    canCreateAgents: true,
    isMobile: false,
    ...overrides,
  }).map((step) => step.targetSelector ?? "");
}

const RAIL_SELECTORS = TOUR_TARGETS.filter(
  (target) => RAIL_ANCHORED[target],
).map(tourSelector);

test("every tour target has a rail-anchored decision", () => {
  assert.deepEqual(
    Object.keys(RAIL_ANCHORED).sort(),
    [...TOUR_TARGETS].sort(),
    "RAIL_ANCHORED and TOUR_TARGETS have drifted apart",
  );
});

test("a target's selector parses back to that target", () => {
  for (const target of TOUR_TARGETS)
    assert.equal(tourTargetName(tourSelector(target)), target);
});

test("an unknown or non-tour selector parses to null", () => {
  assert.equal(tourTargetName("[data-tour-target='nav-typo']"), null);
  assert.equal(tourTargetName('[data-sidebar-group-header="t"]'), null);
  assert.equal(tourTargetName(undefined), null);
});

test("the desktop build spotlights every tour target", () => {
  const selectors = build();
  for (const target of TOUR_TARGETS)
    assert.ok(
      selectors.includes(tourSelector(target)),
      `missing ${tourSelector(target)}`,
    );
  // Every step now points at a declared target: the rail names TEAMS and
  // nothing else, so a team's sections are taught on the team's own SCREEN.
  assert.ok(
    !selectors.some((s) => s.startsWith("[data-sidebar-")),
    "a step still anchors on a rail row that is not a tour target",
  );
});

test("mobile drops every rail-anchored step, and only those", () => {
  const selectors = build({ isMobile: true });
  for (const selector of RAIL_SELECTORS)
    assert.ok(!selectors.includes(selector), `kept ${selector} on mobile`);
  const offRail = TOUR_TARGETS.filter((target) => !RAIL_ANCHORED[target]);
  for (const target of offRail)
    assert.ok(
      selectors.includes(tourSelector(target)),
      `dropped off-rail ${target} on mobile`,
    );
});

test("the replay pointer is rail-anchored, so mobile drops it too", () => {
  // "Guide me" lives behind the help control in the rail's FOOTER, so the
  // replay step obeys the rule every other rail anchor does: below the mobile
  // breakpoint the rail is a closed drawer, and a step pointing into it would
  // render as a card describing a control nobody can see.
  assert.equal(RAIL_ANCHORED.appTour, true);
  assert.ok(build().includes(tourSelector("appTour")));
  assert.ok(!build({ isMobile: true }).includes(tourSelector("appTour")));
});

test("no team keeps every step, because none is anchored on a team row", () => {
  // The sections steps spotlight the SCREEN and let `onEnter` decide what is on
  // it, so a workspace with no teams simply lands them on the Inbox instead of
  // dropping two steps out of the tour.
  const selectors = build({ tourTeamId: null });
  assert.deepEqual(selectors, build());
  // And never a targetless centered card either: the closing card stays the
  // ONLY step with no anchor.
  assert.equal(selectors.filter((s) => s === "").length, 1);
});

test("a caller who cannot create agents loses the New agent step", () => {
  assert.ok(
    !build({ canCreateAgents: false }).includes(tourSelector("newAgent")),
  );
  assert.ok(build().includes(tourSelector("newAgent")));
});

test("the AI Models and Spaces gates still drop their steps", () => {
  assert.ok(
    !build({ showAiModels: false }).includes(tourSelector("nav-ai-hub")),
  );
  assert.ok(
    !build({ capabilities: null }).includes(tourSelector("spaceSwitcher")),
  );
});

test("the global Skills page has a step, right after Integrations", () => {
  const selectors = build();
  const skills = selectors.indexOf(tourSelector("nav-skills"));
  assert.notEqual(skills, -1, "the Skills step is missing");
  assert.equal(skills, selectors.indexOf(tourSelector("nav-integrations")) + 1);
  assert.equal(selectors[skills + 1], tourSelector("nav-ai-hub"));
});

test("the closing card is the only targetless step", () => {
  const targetless = build().filter((s) => s === "");
  assert.equal(targetless.length, 1);
});

test("the tour selector is the attribute selector the DOM renders", () => {
  assert.equal(tourSelector("nav-inbox"), "[data-tour-target='nav-inbox']");
});

test("the Inbox step opens the app-level destinations", () => {
  const selectors = build();
  const inbox = selectors.indexOf(tourSelector("nav-inbox"));
  assert.notEqual(inbox, -1, "the Inbox step is missing");
  assert.equal(
    selectors[inbox + 1],
    tourSelector("nav-integrations"),
    "the Inbox step must head the app-level destinations",
  );
  // And it comes AFTER the team story, never in the middle of it: the last
  // thing before it is the team's Files, taught on the team's own screen.
  assert.equal(
    selectors[inbox - 1],
    tourSelector("main"),
    "the Inbox step landed before the team story finished",
  );
});

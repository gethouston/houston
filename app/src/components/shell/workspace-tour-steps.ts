import type { Capabilities } from "@houston-ai/engine-client";
import { hasSpaces } from "../../lib/org-roles.ts";
import type { TeamSectionId } from "../../lib/teams-model.ts";

/**
 * The closed vocabulary of `data-tour-target` anchors the guided tour uses.
 *
 * A step names one of these and builds its selector with `tourSelector`, never
 * a hand-written string, so a typo is a compile error instead of a step whose
 * spotlight silently finds nothing. Every name here is rendered by a real
 * element: `sidebar-chrome.tsx` (the nav rows + the space switcher),
 * `sidebar.tsx` (`newAgent`), `@houston-ai/layout`'s sidebar (`agents`),
 * `workspace-shell.tsx` (`main`), `mission-toolbar-actions.tsx` (`newMission`,
 * `archivedMissions`) and `settings/help-group.tsx` (`appTour`).
 */
export const TOUR_TARGETS = [
  "spaceSwitcher",
  "agents",
  "nav-dashboard",
  "main",
  "newMission",
  "archivedMissions",
  "nav-integrations",
  "nav-skills",
  "nav-ai-hub",
  "nav-settings",
  "newAgent",
  "nav-agent-store",
  "appTour",
] as const;

export type TourTarget = (typeof TOUR_TARGETS)[number];

const TOUR_TARGET_NAMES: ReadonlySet<string> = new Set(TOUR_TARGETS);

/** The selector `UiTour` queries to spotlight a tour target. */
export function tourSelector(target: TourTarget): string {
  return `[data-tour-target='${target}']`;
}

/**
 * The DOM attributes that make an element a tour anchor. Every producer spreads
 * this instead of writing the attribute by hand, so the anchor and the step
 * that spotlights it are checked against the SAME union: deleting a target
 * without deleting its step (or renaming one side only) is a compile error, not
 * a tour that silently spotlights nothing.
 */
export function tourAnchor(target: TourTarget): {
  "data-tour-target": TourTarget;
} {
  return { "data-tour-target": target };
}

/** The sidebar row for one of a team's sections (`SidebarSectionRows`). */
export function sectionRowSelector(
  teamId: string,
  section: TeamSectionId,
): string {
  return `[data-sidebar-section-row="${teamId}:${section}"]`;
}

/**
 * Whether each target lives INSIDE the sidebar rail.
 *
 * The rail is not always on screen: on a narrow window it auto-collapses, and
 * below the mobile breakpoint it lives in a closed drawer. A step anchored here
 * with no rail on screen would stall on `UiTour`'s retry loop and then render as
 * a centered card describing a row nobody can see, so the gate below drops it
 * instead. The map is exhaustive over `TourTarget`, so a new target cannot ship
 * without answering this question; the answer itself must match where
 * `sidebar-chrome.tsx` / `sidebar.tsx` render the element.
 */
export const RAIL_ANCHORED: Readonly<Record<TourTarget, boolean>> = {
  spaceSwitcher: true,
  agents: true,
  "nav-dashboard": true,
  "nav-integrations": true,
  "nav-skills": true,
  "nav-ai-hub": true,
  "nav-agent-store": true,
  "nav-settings": true,
  newAgent: true,
  main: false,
  newMission: false,
  archivedMissions: false,
  appTour: false,
};

const TOUR_TARGET_PATTERN = /^\[data-tour-target='(?<name>[^']+)'\]$/;
const SECTION_ROW_PREFIX = "[data-sidebar-section-row=";

function isTourTarget(name: string): name is TourTarget {
  return TOUR_TARGET_NAMES.has(name);
}

/** The `TourTarget` a selector points at, or `null` for anything else. */
export function tourTargetName(
  selector: string | undefined,
): TourTarget | null {
  const name = selector?.match(TOUR_TARGET_PATTERN)?.groups?.name;
  return name !== undefined && isTourTarget(name) ? name : null;
}

/** Whether a selector points at a team's section row in the rail. */
export function isSectionRowSelector(selector: string | undefined): boolean {
  return selector?.startsWith(SECTION_ROW_PREFIX) ?? false;
}

/** Whether a selector points at anything the sidebar rail renders. */
export function isRailAnchored(selector: string | undefined): boolean {
  if (isSectionRowSelector(selector)) return true;
  const target = tourTargetName(selector);
  return target !== null && RAIL_ANCHORED[target];
}

/** What the caller's deployment and viewport actually render. */
export interface TourStepGates {
  capabilities: Capabilities | null | undefined;
  /** The AI Models hub is hidden from plain Teams members. */
  showAiModels: boolean;
  /** A caller who cannot create agents has no New agent button to spotlight. */
  canCreateAgents: boolean;
  /** Viewport below the mobile breakpoint, where the rail is a closed drawer. */
  isMobile: boolean;
}

/**
 * Whether a step's anchor exists for this caller.
 *
 * The tour must never stall: a step whose target can't be on screen is dropped
 * while the list is BUILT, so `UiTour` only ever measures anchors that are
 * genuinely there.
 *
 * The switch has no `default`: the declared `boolean` return makes a missing
 * `TourTarget` a compile error, so a new target forces a gating decision here.
 */
export function isStepAvailable(
  targetSelector: string | undefined,
  gates: TourStepGates,
): boolean {
  if (gates.isMobile && isRailAnchored(targetSelector)) return false;
  const target = tourTargetName(targetSelector);
  // Not a tour target: the closing card (no selector) or a team's section row,
  // whose only gate is the rail check above.
  if (target === null) return true;
  switch (target) {
    // Off a spaces host there is no team to switch to.
    case "spaceSwitcher":
      return hasSpaces(gates.capabilities);
    case "nav-ai-hub":
      return gates.showAiModels;
    case "newAgent":
      return gates.canCreateAgents;
    // Rendered for every caller, on every deployment.
    case "agents":
    case "nav-dashboard":
    case "main":
    case "newMission":
    case "archivedMissions":
    case "nav-integrations":
    case "nav-skills":
    case "nav-settings":
    case "nav-agent-store":
    case "appTour":
      return true;
  }
}

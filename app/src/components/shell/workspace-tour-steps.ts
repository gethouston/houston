/**
 * The closed vocabulary of `data-tour-target` anchors the guided surfaces use.
 *
 * A caller names one of these and builds its selector with `tourSelector`,
 * never a hand-written string, so a typo is a compile error instead of a
 * spotlight that silently finds nothing. Every name here is rendered by a real
 * element: `sidebar-nav-sections.tsx` (the rail's nav rows), `sidebar-chrome.tsx`
 * (the space switcher), `sidebar-rail.tsx` (`newAgent`), `sidebar-footer.tsx`
 * (`nav-settings`), `sidebar-help-menu.tsx` (`appTour`, the help control the
 * in-app setup is started from), `@houston-ai/layout`'s sidebar (`agents`),
 * `workspace-shell.tsx` (`main`), `new-mission-button.tsx` (`newMission` on
 * desktop), `agents-home-list.tsx` (`newAgent` again, the phone's own create
 * control), and `mobile-nav-bar.tsx` (`newMission` again — the round compose
 * beside the pill is the phone's only one; `mobileMenu`, the More button the
 * phone's long tail of destinations is reached through; and
 * `mobileAgentsTab`, the item that opens the Agents home).
 *
 * The vocabulary is shared: the in-app onboarding spotlights these anchors
 * (`in-app-onboarding.tsx`) and the e2e specs address the shell by them.
 */
export const TOUR_TARGETS = [
  "spaceSwitcher",
  "agents",
  "nav-inbox",
  "main",
  "newMission",
  "nav-integrations",
  "nav-skills",
  "nav-ai-hub",
  "nav-settings",
  "newAgent",
  "nav-agent-store",
  "appTour",
  "mobileMenu",
  "mobileAgentsTab",
] as const;

export type TourTarget = (typeof TOUR_TARGETS)[number];

/** The selector a spotlight queries to find a target. */
export function tourSelector(target: TourTarget): string {
  return `[data-tour-target='${target}']`;
}

/**
 * The DOM attributes that make an element a spotlight anchor. Every producer
 * spreads this instead of writing the attribute by hand, so the anchor and the
 * step that spotlights it are checked against the SAME union: deleting a target
 * without deleting its step (or renaming one side only) is a compile error, not
 * a spotlight that silently points at nothing.
 */
export function tourAnchor(target: TourTarget): {
  "data-tour-target": TourTarget;
} {
  return { "data-tour-target": target };
}

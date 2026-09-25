/**
 * The closed vocabulary of `data-tour-target` anchors the guided surfaces use.
 *
 * A caller names one of these and builds its selector with `tourSelector`,
 * never a hand-written string, so a typo is a compile error instead of a
 * spotlight that silently finds nothing. Every name here is rendered by a real
 * element: `sidebar-nav-sections.tsx` and `sidebar-nav-rows.tsx` (the rail's
 * nav rows, Skills and the Academy included, which the phone's More menu
 * draws too), `sidebar-chrome.tsx`
 * (the space switcher), `sidebar-rail.tsx` (`newAgent`), `sidebar-footer.tsx`
 * (`nav-settings`), `@houston-ai/layout`'s sidebar (`agents`),
 * `workspace-shell.tsx` (`main`), `new-mission-button.tsx` (`newMission` on
 * desktop), `agents-home-list.tsx` (`newAgent` again, the phone's own create
 * control), and `mobile-nav-bar.tsx` (`newMission` again — the round compose
 * beside the pill is the phone's only one; `mobileMenu`, the More button the
 * phone's long tail of destinations is reached through; and
 * `mobileAgentsTab`, the item that opens the Agents home), and the task chat
 * on either screen: `shell-panel-card.tsx` (`taskChat`, the desktop detail
 * panel) and `mission-chat-screen.tsx` (`taskChat` again, the phone's pushed
 * chat).
 *
 * The vocabulary is shared: the Academy's lessons spotlight these anchors
 * (`components/academy/lessons/registry.ts`) and the e2e specs address the
 * shell by them.
 */
export const TOUR_TARGETS = [
  "spaceSwitcher",
  "agents",
  "main",
  "newMission",
  "nav-integrations",
  "nav-ai-hub",
  "nav-settings",
  "nav-skills",
  "nav-academy",
  "newAgent",
  "mobileMenu",
  "mobileAgentsTab",
  "taskChat",
] as const;

export type TourTarget = (typeof TOUR_TARGETS)[number];

/** The selector a spotlight queries to find a target. */
export function tourSelector(target: TourTarget): string {
  return `[data-tour-target='${target}']`;
}

/**
 * The send button of the composer inside a target. `ui/chat` marks it with
 * `data-composer-submit`, since a props-only package cannot carry an app
 * anchor.
 */
export function composerSendSelector(within: TourTarget): string {
  return `${tourSelector(within)} [data-composer-submit]`;
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

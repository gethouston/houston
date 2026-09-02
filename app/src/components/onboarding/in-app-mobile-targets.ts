import { tourSelector } from "../shell/workspace-tour-steps.ts";

/**
 * Where the in-app onboarding's spot steps point on the PHONE, kept pure so
 * the fork unit-tests without React (`app/tests/in-app-mobile-targets.test.ts`).
 *
 * Below md the shell is a different tree, not a narrower one: the sidebar rail
 * lives in a drawer behind the top bar's hamburger, the board's New task is
 * the phone board's own compose control, and composing is a pushed chat
 * screen rather than the board's side panel. A step that names a desktop
 * control by selector alone points at nothing there — and with nothing to
 * ring, the veil's blockers cover the whole screen, the hamburger included.
 */

/** A sidebar-row step's three shapes: the rail on the glass (desktop), the
 *  hamburger while the drawer is shut, the row inside the open drawer. */
export type DrawerSpotPhase = "rail" | "openMenu" | "inDrawer";

export function drawerSpotPhase(args: {
  isMobile: boolean;
  drawerOpen: boolean;
}): DrawerSpotPhase {
  if (!args.isMobile) return "rail";
  return args.drawerOpen ? "inDrawer" : "openMenu";
}

/** What the send step is ringing: the New task control, the desktop board's
 *  side panel, or the phone's pushed draft chat. */
export type SendMissionSurface = "button" | "panel" | "chat";

export function sendMissionSurface(args: {
  panelOpen: boolean;
  chatOpen: boolean;
}): SendMissionSurface {
  if (args.chatOpen) return "chat";
  if (args.panelOpen) return "panel";
  return "button";
}

const MISSION_PANEL = '[data-testid="mission-panel"]';
const MISSION_CHAT = '[data-testid="mission-chat-screen"]';

/**
 * The send step's selector. The New task control is scoped to the ACTIVE
 * screen (kept-alive views keep their own), and the spotlight itself takes
 * the visible match, so the desktop button hidden beside the phone's compose
 * never wins. In email mode the composer arrives prewritten and locked, and
 * the hole narrows to the send button alone.
 */
export function sendMissionSelector(
  surface: SendMissionSurface,
  emailMode: boolean,
): string {
  if (surface === "button")
    return `[data-screen-active='true'] ${tourSelector("newMission")}`;
  const root = surface === "chat" ? MISSION_CHAT : MISSION_PANEL;
  return emailMode ? `${root} button[type="submit"]` : root;
}

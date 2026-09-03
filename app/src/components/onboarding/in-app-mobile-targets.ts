import { AGENTS_HOME_VIEW_ID } from "../../lib/top-level-views.ts";
import { tourSelector } from "../shell/workspace-tour-steps.ts";

/**
 * Where the in-app onboarding's spot steps point on the PHONE, kept pure so
 * the fork unit-tests without React (`app/tests/in-app-mobile-targets.test.ts`).
 *
 * Below md the shell is a different tree, not a narrower one: there is no
 * sidebar rail at all (the long tail of destinations is the nav bar's More
 * menu, creating an agent is a control on the Agents home), New task is the
 * round control beside the nav pill, and composing is a pushed chat
 * screen rather than the board's side panel. A step that names a desktop
 * control by selector alone points at nothing there — and with nothing to
 * ring, the veil's blockers cover the whole screen, the way in included.
 */

/** Where a step's control lives on the phone. */
export type MobileSpotHome = "more" | "agents";

/**
 * A step's shapes: the rail on the glass (desktop), the way IN while the
 * control is out of reach, and the control itself once it is reachable —
 * inside the More menu (a dialog, so `inDialog`) or plainly on the Agents
 * home screen.
 */
export type MobileSpotPhase =
  | "rail"
  | "openMenu"
  | "inMenu"
  | "openAgents"
  | "onScreen";

export function mobileSpotPhase(args: {
  isMobile: boolean;
  home: MobileSpotHome;
  /** Whether the nav bar's More menu is up. */
  menuOpen: boolean;
  viewMode: string;
}): MobileSpotPhase {
  if (!args.isMobile) return "rail";
  if (args.home === "more") return args.menuOpen ? "inMenu" : "openMenu";
  return args.viewMode === AGENTS_HOME_VIEW_ID ? "onScreen" : "openAgents";
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
const NAV_BAR = "[data-testid='mobile-nav-bar']";

/**
 * The send step's selector.
 *
 * The New task control lives in a different place on each breakpoint, so the
 * selector does too. On DESKTOP it is a toolbar button inside a screen, and
 * kept-alive views each keep their own — hence the scope to the active one.
 * On the PHONE it is the round control beside the nav bar, which sits OUTSIDE
 * every screen: scoping it to the active screen would find nothing and the
 * veil would cover the way in.
 *
 * In email mode the composer arrives prewritten and locked, and the hole
 * narrows to the send button alone.
 */
export function sendMissionSelector(
  surface: SendMissionSurface,
  emailMode: boolean,
  isMobile: boolean,
): string {
  if (surface === "button")
    return isMobile
      ? `${NAV_BAR} ${tourSelector("newMission")}`
      : `[data-screen-active='true'] ${tourSelector("newMission")}`;
  const root = surface === "chat" ? MISSION_CHAT : MISSION_PANEL;
  return emailMode ? `${root} button[type="submit"]` : root;
}

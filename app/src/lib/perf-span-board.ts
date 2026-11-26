import type { HiddenTime } from "./perf-span-visibility.ts";
import type { TeamSectionId } from "./team-sections.ts";
import { isMissionBoardSurface } from "./top-level-views.ts";

/**
 * Whether an `app_to_board` span is a load time. The span runs from app
 * start, so it only measures the wait for the board when the board is the
 * first screen after launch (`landing`, the phone opens on its Agents list),
 * no sign-in screen or onboarding sat inside it, and the page did not open
 * hidden. Otherwise PostHog alone gets it, tagged with why. Time the page
 * spent hidden is subtracted from what the gateway gets.
 */
export interface BoardLoadTags {
  signInShown: boolean;
  onboardingShown: boolean;
  hiddenMs: number;
  openedHidden: boolean;
  /** The first screen painted after launch; null when none reported. */
  landing: string | null;
}

export interface BoardLoadResult {
  tags: BoardLoadTags;
  /** The span minus hidden time: what the gateway histogram gets. */
  activeMs: number;
  ship: boolean;
}

export const BOARD_LANDING = "board";

/** The screen name a launch landed on, as `landing` reports it. */
export function landingScreen(
  ui: {
    viewMode: string;
    agentSection: TeamSectionId | null;
    chatAgentId: string | null;
  },
  isMobile: boolean,
): string {
  if (isMobile && ui.chatAgentId !== null) return "chat";
  if (isMissionBoardSurface(ui)) return BOARD_LANDING;
  return ui.viewMode;
}

export class BoardLoad {
  private signIn = false;
  private onboarding = false;
  private landing: string | null = null;

  constructor(private readonly hidden: HiddenTime) {}

  signInShown(): void {
    this.signIn = true;
  }

  onboardingShown(): void {
    this.onboarding = true;
  }

  /** Only the first report counts: later ones are the user moving around. */
  landedOn(screen: string): void {
    this.landing ??= screen;
  }

  finish(totalMs: number, at: number): BoardLoadResult {
    const { hiddenMs, openedHidden } = this.hidden.finish(at);
    const tags: BoardLoadTags = {
      signInShown: this.signIn,
      onboardingShown: this.onboarding,
      hiddenMs,
      openedHidden,
      landing: this.landing,
    };
    const ship =
      !tags.signInShown &&
      !tags.onboardingShown &&
      !openedHidden &&
      tags.landing === BOARD_LANDING;
    return { tags, activeMs: Math.max(0, totalMs - hiddenMs), ship };
  }
}

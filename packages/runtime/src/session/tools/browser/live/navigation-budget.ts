import type { BrowserLiveInput } from "@houston/wire-types";

/** A navigation from the live view returns once it commits, never later. */
export const NAVIGATE_TIMEOUT_MS = 15_000;

/**
 * A batch's navigations (Back, an address) share this much time in all. The
 * person's Done waits behind the batch, so several Backs on a hung site must
 * not hold it for several times {@link NAVIGATE_TIMEOUT_MS}.
 */
export const BATCH_NAVIGATION_MS = 10_000;

/**
 * Less time than this can't commit a navigation. A timer can fire a millisecond
 * early by Date.now(), so a hung Back would otherwise leave 1 ms and start
 * another Back that only times out.
 */
export const MIN_NAVIGATION_MS = 50;

export function isNavigation(event: BrowserLiveInput): boolean {
  return event.type === "navigate" || event.type === "back";
}

/** The navigation time one input batch has left. */
export class NavigationBudget {
  private until = 0;

  constructor(
    private readonly batchMs = BATCH_NAVIGATION_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** A new batch starts with the whole budget. */
  restart(): void {
    this.until = this.now() + this.batchMs;
  }

  spent(): boolean {
    return this.until - this.now() < MIN_NAVIGATION_MS;
  }

  /**
   * The timeout for the next navigation: what is left, capped at one
   * navigation's, never 0 (which Playwright reads as "no timeout").
   */
  timeout(): number {
    return Math.max(1, Math.min(NAVIGATE_TIMEOUT_MS, this.until - this.now()));
  }
}

import type { BrowserLiveInput } from "@houston/wire-types";

export const NAVIGATE_TIMEOUT_MS = 15_000;

export const BATCH_NAVIGATION_MS = 10_000;

export const MIN_NAVIGATION_MS = 50;

export function isNavigation(event: BrowserLiveInput): boolean {
  return event.type === "navigate" || event.type === "back";
}

export class NavigationBudget {
  private until = 0;

  constructor(
    private readonly batchMs = BATCH_NAVIGATION_MS,
    private readonly now: () => number = Date.now,
  ) {}

  restart(): void {
    this.until = this.now() + this.batchMs;
  }

  spent(): boolean {
    return this.until - this.now() < MIN_NAVIGATION_MS;
  }

  timeout(): number {
    return Math.max(1, Math.min(NAVIGATE_TIMEOUT_MS, this.until - this.now()));
  }
}

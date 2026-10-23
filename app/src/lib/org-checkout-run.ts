import type {
  SeatCheckoutOutcome,
  SeatIntervalRefusal,
} from "@houston/engine-adapter";
import {
  type BillingCheckoutTracker,
  billingCheckoutOutstanding,
} from "@houston/sdk";
import type { ReservedTab } from "./browser-tab.ts";

/** The effects one org checkout needs besides the tracker. */
export interface OrgCheckoutRun {
  orgSlug: string;
  /** The session: a fresh one, or the one a paid create already answered. */
  create: () => Promise<SeatCheckoutOutcome>;
  /** A session already made, offered as the link if nothing starts. */
  madeUrl?: string;
  /** A tab claimed inside the click, or null to open the browser plainly. */
  tab: ReservedTab | null;
  /** Opens the URL outside the app; false when nothing could open it. */
  open: (url: string) => Promise<boolean>;
  /** Refetch whatever reads the org's billing. */
  refresh: () => Promise<unknown>;
  report: (command: string, error: unknown) => void;
  /** The gateway refused the interval: nothing opened, the billing refetched. */
  onRefused?: (refusal: SeatIntervalRefusal) => void;
}

/**
 * Run one org checkout through the app's tracker and answer the link to offer
 * when no browser took it, else null. A tab that cannot take the URL falls
 * back to a plain open, and a failure after the session was made keeps its
 * link, so a person is never left without a way to pay. Nothing started
 * (another checkout outstanding, a failed create) leaves no empty tab behind.
 */
export async function runOrgCheckout(
  tracker: BillingCheckoutTracker,
  run: OrgCheckoutRun,
): Promise<string | null> {
  const { orgSlug, tab } = run;
  const fallback = () => {
    const state = tracker.getSnapshot();
    return state.phase === "open" && state.orgSlug === orgSlug
      ? state.fallbackUrl
      : null;
  };
  const navigate = async (url: string) => {
    if (tab === null) return false;
    try {
      return await tab.navigate(url);
    } catch (error) {
      tab.discard();
      run.report("billing_checkout_tab", error);
      return false;
    }
  };
  try {
    const started = await tracker.start(orgSlug, {
      create: run.create,
      open: async (url) => (await navigate(url)) || run.open(url),
    });
    if (started !== "started" && started !== "skipped") {
      tab?.discard();
      // The prices the surface showed are stale: refetch them, so a yearly
      // seat the gateway stopped selling leaves the choice.
      await run.refresh();
      run.onRefused?.(started);
      return null;
    }
    if (started === "skipped") {
      tab?.discard();
      // Another checkout is outstanding: this one's session still stands.
      // An idle tracker means the identity changed mid-start, and the old
      // account's session must never reach the next one.
      return billingCheckoutOutstanding(tracker.getSnapshot())
        ? (run.madeUrl ?? null)
        : null;
    }
    await run.refresh();
    return fallback();
  } catch (error) {
    tab?.discard();
    run.report("billing_checkout", error);
    return fallback();
  }
}

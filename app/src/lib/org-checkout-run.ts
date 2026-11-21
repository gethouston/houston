import type {
  SeatCheckoutOutcome,
  SeatIntervalRefusal,
} from "@houston/engine-adapter";
import {
  type BillingCheckoutTracker,
  billingCheckoutOutstanding,
} from "@houston/sdk";
import type { ReservedTab } from "./browser-tab.ts";

export interface OrgCheckoutRun {
  orgSlug: string;
  create: () => Promise<SeatCheckoutOutcome>;
  madeUrl?: string;
  tab: ReservedTab | null;
  open: (url: string) => Promise<boolean>;
  refresh: () => Promise<unknown>;
  report: (command: string, error: unknown) => void;
  onRefused?: (refusal: SeatIntervalRefusal) => void;
}

export async function runOrgCheckout(
  tracker: BillingCheckoutTracker,
  run: OrgCheckoutRun,
): Promise<string | null> {
  const { orgSlug, tab } = run;
  const fallback = () => {
    const state = tracker.getSnapshot();
    return state.phase === "open" && state.orgSlug === orgSlug && !state.opened
      ? state.url
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
      await run.refresh();
      run.onRefused?.(started);
      return null;
    }
    if (started === "skipped") {
      tab?.discard();
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

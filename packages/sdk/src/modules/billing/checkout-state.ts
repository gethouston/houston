import type {
  OrgBilling,
  SeatCheckoutOutcome,
  SeatIntervalRefusal,
} from "@houston/wire-types";

/**
 * How long a checkout this app opened stays outstanding: its triggers stay
 * disabled and the orgs list is polled until the org is paid for, the person
 * cancels or starts over, or this elapses.
 */
export const BILLING_CHECKOUT_WINDOW_MS = 600_000;

/**
 * How long this app owns the return from a checkout it opened. Separate from
 * the poll window: Stripe's page can stay open long after the poll gives up.
 */
export const BILLING_CHECKOUT_RETURN_MS = 86_400_000;

export type BillingCheckoutState =
  | { phase: "idle" }
  | { phase: "creating"; orgSlug: string }
  | {
      phase: "open";
      orgSlug: string;
      startedAt: number;
      /** The session's page, kept so the person can reopen the same one. */
      url: string;
      /**
       * False once nothing could open `url`, so the surface offers it as the
       * way in; true while the browser is opening it, and after.
       */
      opened: boolean;
    }
  | { phase: "succeeded"; orgSlug: string };

/** How a person came back from Stripe's page: paid, or backed out. */
export type BillingCheckoutReturnOutcome = "success" | "cancel";

/** The two effects a checkout needs: the session from the gateway, a browser. */
export interface BillingCheckoutPorts {
  /** The session, or the interval the gateway refused (nothing opens). */
  create(): Promise<SeatCheckoutOutcome>;
  /** Opens the URL outside the app; false when nothing could open it. */
  open(url: string): Promise<boolean>;
}

/** What one `start` did: opened a checkout, sent nothing, or was refused. */
export type BillingCheckoutStart = "started" | "skipped" | SeatIntervalRefusal;

/** A checkout is being created, or its page is open and the org is not paid yet. */
export function billingCheckoutOutstanding(
  state: BillingCheckoutState,
): boolean {
  return state.phase === "creating" || state.phase === "open";
}

/**
 * Whether an org is paid for: paid, active, and no lock scheduled. A paid tier
 * alone is not enough, since a payment that failed keeps the tier and sets a
 * lock, and that must never read as a checkout that succeeded.
 */
export function orgPaidUp(billing: OrgBilling | null | undefined): boolean {
  return (
    billing?.tier === "paid" &&
    billing.status === "active" &&
    billing.lockAt === null
  );
}

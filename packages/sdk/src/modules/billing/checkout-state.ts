import type {
  OrgBilling,
  SeatCheckoutOutcome,
  SeatIntervalRefusal,
} from "@houston/wire-types";

export const BILLING_CHECKOUT_WINDOW_MS = 600_000;

export const BILLING_CHECKOUT_RETURN_MS = 86_400_000;

export type BillingCheckoutState =
  | { phase: "idle" }
  | { phase: "creating"; orgSlug: string }
  | {
      phase: "open";
      orgSlug: string;
      startedAt: number;
      url: string;
      opened: boolean;
    }
  | { phase: "succeeded"; orgSlug: string };

export type BillingCheckoutReturnOutcome = "success" | "cancel";

export interface BillingCheckoutPorts {
  create(): Promise<SeatCheckoutOutcome>;
  open(url: string): Promise<boolean>;
}

export type BillingCheckoutStart = "started" | "skipped" | SeatIntervalRefusal;

export function billingCheckoutOutstanding(
  state: BillingCheckoutState,
): boolean {
  return state.phase === "creating" || state.phase === "open";
}

export function orgPaidUp(billing: OrgBilling | null | undefined): boolean {
  return (
    billing?.tier === "paid" &&
    billing.status === "active" &&
    billing.lockAt === null
  );
}

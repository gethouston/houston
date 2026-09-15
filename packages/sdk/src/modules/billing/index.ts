/**
 * The billing module (C8) — the active team's Stripe subscription: what it is
 * today, and the two hosted pages that change it. The spaces the subscription
 * belongs to live in the spaces family.
 *
 * These are pure commands over hosted-gateway routes: the summary is read when
 * a billing screen opens and each hand-off is a button's one-shot, so there is
 * no reactive scope to publish and nothing here subscribes to an event. The
 * same handlers back both the typed facade and the bridge `dispatch` path.
 *
 * SEAM — space-scoped, NOT per-agent. The gateway resolves the team from the
 * caller's session plus the active-space header its `fetch` stamps, so nothing
 * here names an agent and the module runs on its own {@link moduleScope} rooted
 * at the base URL, never `clientFor(agentId)`. A 401 routes through the shared
 * {@link ModuleContext.authExpiry} notifier.
 */

import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import type { BillingSummary } from "../spaces/types";
import { createCheckout, createPortal, getBilling } from "./http";
import { type BillingCheckout, BillingCommand, requireInterval } from "./types";

export type { BillingCheckout, BillingCommandType } from "./types";
export { BILLING_INTERVALS, BillingCommand } from "./types";

/** The typed facade for the billing family. Every call throws on a non-2xx. */
export interface BillingModule {
  /** The active team's subscription summary. Throws a 404/403/503 like any
   *  other status — the not-entitled reading is the surface's. */
  getBilling(): Promise<BillingSummary>;
  /** Start a Stripe Checkout session for the active team (owner only). */
  createCheckout(interval: "monthly" | "annual"): Promise<BillingCheckout>;
  /** Open the Stripe customer portal for the active team (owner only). */
  createPortal(): Promise<BillingCheckout>;
}

/** A failed billing request. `status` is the upstream HTTP status. */
export class BillingHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "BillingHttpError");
  }
}

export function createBillingModule(ctx: ModuleContext): BillingModule {
  const scope = moduleScope(ctx, "billing", BillingHttpError);

  const module: BillingModule = {
    getBilling: () => getBilling(scope),
    createCheckout: (interval) => createCheckout(scope, interval),
    createPortal: () => createPortal(scope),
  };

  ctx.registerCommand(BillingCommand.Get, () => module.getBilling());
  ctx.registerCommand(BillingCommand.CreateCheckout, (p) =>
    module.createCheckout(requireInterval(p, "interval")),
  );
  ctx.registerCommand(BillingCommand.CreatePortal, () => module.createPortal());

  return module;
}

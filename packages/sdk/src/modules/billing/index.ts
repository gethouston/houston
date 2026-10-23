/**
 * The billing module: an org's Stripe subscription (what it is today and the
 * two hosted pages that change it), the free-slot swap, a free org's routine
 * rules and presence, and the free-org pick. The orgs themselves, with the
 * billing state each carries, live in the spaces family.
 *
 * These are pure commands over hosted-gateway routes: the summary is read when
 * a billing screen opens and each hand-off is a button's one-shot, so there is
 * no reactive scope to publish and nothing here subscribes to an event. The
 * same handlers back both the typed facade and the `dispatch` path.
 *
 * SEAM — space-scoped, NOT per-agent. The gateway resolves the org from the
 * caller's session plus the active-space header its `fetch` stamps, so nothing
 * here names an agent and the module runs on its own {@link moduleScope}
 * rooted at the base URL, never
 * `clientFor(agentId)`. A 401 routes through the shared
 * {@link ModuleContext.authExpiry} notifier. The free-org pick (`choice.ts`)
 * is the exception: it is account-wide, so the gateway ignores the space and
 * the adapter's fetch never stamps one on it.
 */

import type {
  BillingChoice,
  BillingChoicePick,
  BillingInterval,
  PlanRoutine,
  PlanRoutineKey,
  SeatCheckoutOutcome,
} from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import type { BillingSummary } from "../spaces/types";
import {
  type BillingChoiceSave,
  dismissChoiceNotice,
  getChoice,
  setChoice,
} from "./choice";
import {
  type ClaimFreeSlotResult,
  claimFreeSlot,
  createCheckout,
  createPortal,
  getBilling,
} from "./http";
import {
  dismissPriceNotice,
  type SwitchToYearlyResult,
  switchToYearly,
} from "./price-notice";
import {
  keepRoutine,
  listPlanRoutines,
  reportPresence,
  resumeRoutines,
} from "./routines";
import { checkoutIntervalField } from "./seat-price";
import {
  type BillingCheckout,
  BillingCommand,
  optionalInterval,
  requireChoicePick,
  requireRoutineKey,
} from "./types";

export type { BillingChoiceSave } from "./choice";
export { billingChoiceRefusal } from "./choice";
export { type ClaimFreeSlotResult, claimFreeSlotRefusal } from "./http";
export {
  type PromoEndedView,
  promoEndedModalOpens,
  promoEndedView,
  type SwitchToYearlyResult,
  switchToYearlyRefusal,
} from "./price-notice";
export type { BillingCheckout, BillingCommandType } from "./types";
export { BillingCommand } from "./types";

/** The typed facade for the billing family. Every call throws on a non-2xx. */
export interface BillingModule {
  /** The active org's C8 subscription summary. Throws a 404/403/503 like
   *  any other status — the not-entitled reading is the surface's. */
  getBilling(): Promise<BillingSummary>;
  /**
   * Start a per-seat checkout for the active org, monthly unless `interval`
   * says `year` (billing owner only). An interval refusal is an outcome.
   */
  createCheckout(input?: {
    interval?: BillingInterval;
  }): Promise<SeatCheckoutOutcome>;
  /** Open the Stripe customer portal for the active org (billing owner only). */
  createPortal(): Promise<BillingCheckout>;
  /** Make the active org the free one; the caller's states are outcomes. */
  claimFreeSlot(): Promise<ClaimFreeSlotResult>;
  /** The person's free-org pick, account-wide; null where the change is not run. */
  getChoice(): Promise<BillingChoice | null>;
  /** Store the pick. The person's own states are outcomes, never throws. */
  setChoice(pick: BillingChoicePick): Promise<BillingChoiceSave>;
  /** Hide the announcement on every device. */
  dismissChoiceNotice(): Promise<void>;
  /** The active org's enabled routines. */
  listPlanRoutines(): Promise<{ routines: PlanRoutine[] }>;
  /** Choose the one routine a free org keeps firing. */
  keepRoutine(key: PlanRoutineKey): Promise<void>;
  /** Resume the active org's routines paused while nobody was around. */
  resumeRoutines(): Promise<void>;
  /** Report that the active org is open in the foreground. */
  reportPresence(): Promise<void>;
  /** Move the active org's monthly subscription to yearly; refusals are outcomes. */
  switchToYearly(): Promise<SwitchToYearlyResult>;
  /** Hide the active org's promo-ended notice everywhere. */
  dismissPriceNotice(): Promise<void>;
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
    createCheckout: (input) =>
      createCheckout(scope, checkoutIntervalField(input?.interval)),
    createPortal: () => createPortal(scope),
    claimFreeSlot: () => claimFreeSlot(scope),
    getChoice: () => getChoice(scope),
    setChoice: (pick) => setChoice(scope, pick),
    dismissChoiceNotice: () => dismissChoiceNotice(scope),
    listPlanRoutines: () => listPlanRoutines(scope),
    keepRoutine: (key) => keepRoutine(scope, key),
    resumeRoutines: () => resumeRoutines(scope),
    reportPresence: () => reportPresence(scope),
    switchToYearly: () => switchToYearly(scope),
    dismissPriceNotice: () => dismissPriceNotice(scope),
  };

  ctx.registerCommand(BillingCommand.Get, () => module.getBilling());
  ctx.registerCommand(BillingCommand.CreateCheckout, (p) =>
    module.createCheckout({ interval: optionalInterval(p) }),
  );
  ctx.registerCommand(BillingCommand.CreatePortal, () => module.createPortal());
  ctx.registerCommand(BillingCommand.ClaimFreeSlot, () =>
    module.claimFreeSlot(),
  );
  ctx.registerCommand(BillingCommand.GetChoice, () => module.getChoice());
  ctx.registerCommand(BillingCommand.SetChoice, (p) =>
    module.setChoice(requireChoicePick(p)),
  );
  ctx.registerCommand(BillingCommand.DismissChoiceNotice, () =>
    module.dismissChoiceNotice(),
  );
  ctx.registerCommand(BillingCommand.ListRoutines, () =>
    module.listPlanRoutines(),
  );
  ctx.registerCommand(BillingCommand.KeepRoutine, (p) =>
    module.keepRoutine(requireRoutineKey(p)),
  );
  ctx.registerCommand(BillingCommand.ResumeRoutines, () =>
    module.resumeRoutines(),
  );
  ctx.registerCommand(BillingCommand.Presence, () => module.reportPresence());
  ctx.registerCommand(BillingCommand.SwitchToYearly, () =>
    module.switchToYearly(),
  );
  ctx.registerCommand(BillingCommand.DismissPriceNotice, () =>
    module.dismissPriceNotice(),
  );

  return module;
}

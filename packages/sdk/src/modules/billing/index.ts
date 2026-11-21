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

export interface BillingModule {
  getBilling(): Promise<BillingSummary>;
  createCheckout(input?: {
    interval?: BillingInterval;
  }): Promise<SeatCheckoutOutcome>;
  createPortal(): Promise<BillingCheckout>;
  claimFreeSlot(): Promise<ClaimFreeSlotResult>;
  getChoice(): Promise<BillingChoice | null>;
  setChoice(pick: BillingChoicePick): Promise<BillingChoiceSave>;
  dismissChoiceNotice(): Promise<void>;
  listPlanRoutines(): Promise<{ routines: PlanRoutine[] }>;
  keepRoutine(key: PlanRoutineKey): Promise<void>;
  resumeRoutines(): Promise<void>;
  reportPresence(): Promise<void>;
  switchToYearly(): Promise<SwitchToYearlyResult>;
  dismissPriceNotice(): Promise<void>;
}

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

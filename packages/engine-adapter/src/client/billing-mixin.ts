import type {
  BillingChoiceSave,
  ClaimFreeSlotResult,
  SwitchToYearlyResult,
} from "@houston/sdk";
import type {
  BillingChoice,
  BillingChoicePick,
  BillingInterval,
  PlanRoutine,
  PlanRoutineKey,
  SeatCheckoutOutcome,
} from "@houston/wire-types";
import type * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function BillingMixin<TBase extends BaseCtor>(Base: TBase) {
  class Billing extends Base {
    async getBilling(): Promise<controlPlane.BillingSummary | null> {
      if (!this.ctx.cp) return null;
      try {
        return await viaSdk("/v1/org/billing", () =>
          this.ctx.sdk.billing.getBilling(),
        );
      } catch (err) {
        if (
          err instanceof HoustonEngineError &&
          (err.status === 404 || err.status === 403 || err.status === 503)
        ) {
          return null;
        }
        throw err;
      }
    }
    async createCheckout(input?: {
      interval?: BillingInterval;
    }): Promise<SeatCheckoutOutcome> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return viaSdk("/v1/org/billing/checkout", () =>
        this.ctx.sdk.billing.createCheckout(input),
      );
    }
    async createPortal(): Promise<controlPlane.BillingCheckout> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return viaSdk("/v1/org/billing/portal", () =>
        this.ctx.sdk.billing.createPortal(),
      );
    }
    async claimFreeSlot(): Promise<ClaimFreeSlotResult> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return viaSdk("/v1/org/billing/free", () =>
        this.ctx.sdk.billing.claimFreeSlot(),
      );
    }
    async switchToYearly(): Promise<SwitchToYearlyResult> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return viaSdk("/v1/org/billing/switch-to-yearly", () =>
        this.ctx.sdk.billing.switchToYearly(),
      );
    }
    async dismissPriceNotice(): Promise<void> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return viaSdk("/v1/org/billing/price-notice/dismiss", () =>
        this.ctx.sdk.billing.dismissPriceNotice(),
      );
    }
    listPlanRoutines(): Promise<{ routines: PlanRoutine[] }> {
      return viaSdk("/v1/me/routines", () =>
        this.ctx.sdk.billing.listPlanRoutines(),
      );
    }
    keepRoutine(key: PlanRoutineKey): Promise<void> {
      return viaSdk("/v1/me/routines/keep", () =>
        this.ctx.sdk.billing.keepRoutine(key),
      );
    }
    resumeRoutines(): Promise<void> {
      return viaSdk("/v1/me/routines/resume", () =>
        this.ctx.sdk.billing.resumeRoutines(),
      );
    }
    reportPresence(): Promise<void> {
      return viaSdk("/v1/me/presence", () =>
        this.ctx.sdk.billing.reportPresence(),
      );
    }
    async getBillingChoice(): Promise<BillingChoice | null> {
      if (!this.ctx.cp) return null;
      return viaSdk("/v1/me/billing-choice", () =>
        this.ctx.sdk.billing.getChoice(),
      );
    }
    async setBillingChoice(
      pick: BillingChoicePick,
    ): Promise<BillingChoiceSave> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return viaSdk("/v1/me/billing-choice", () =>
        this.ctx.sdk.billing.setChoice(pick),
      );
    }
    async dismissBillingChoiceNotice(): Promise<void> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return viaSdk("/v1/me/billing-choice/dismiss", () =>
        this.ctx.sdk.billing.dismissChoiceNotice(),
      );
    }
  }
  return Billing;
}

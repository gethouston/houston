import type {
  PlanCheckout,
  PlanRoutine,
  PlanRoutineKey,
  PlanSummary,
  PlusInvoice,
} from "@houston/wire-types";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/** C19 personal plan. The gateway ignores the active-space header. */
export function PlanMixin<TBase extends BaseCtor>(Base: TBase) {
  class Plan extends Base {
    getPlan(): Promise<PlanSummary> {
      return viaSdk("/v1/me/plan", () => this.ctx.sdk.plan.getPlan());
    }
    dismissPlanAnnouncement(): Promise<void> {
      return viaSdk("/v1/me/plan/announcement", () =>
        this.ctx.sdk.plan.dismissPlanAnnouncement(),
      );
    }
    createPlusCheckout(): Promise<PlanCheckout> {
      return viaSdk("/v1/me/plus/checkout", () =>
        this.ctx.sdk.plan.createPlusCheckout(),
      );
    }
    createPlusPortal(): Promise<PlanCheckout> {
      return viaSdk("/v1/me/plus/portal", () =>
        this.ctx.sdk.plan.createPlusPortal(),
      );
    }
    listPlusInvoices(): Promise<{ invoices: PlusInvoice[] }> {
      return viaSdk("/v1/me/plus/invoices", () =>
        this.ctx.sdk.plan.listPlusInvoices(),
      );
    }
    listPlanRoutines(): Promise<{ routines: PlanRoutine[] }> {
      return viaSdk("/v1/me/routines", () =>
        this.ctx.sdk.plan.listPlanRoutines(),
      );
    }
    keepRoutine(key: PlanRoutineKey): Promise<PlanSummary> {
      return viaSdk("/v1/me/routines/keep", () =>
        this.ctx.sdk.plan.keepRoutine(key),
      );
    }
    resumeRoutines(): Promise<PlanSummary> {
      return viaSdk("/v1/me/routines/resume", () =>
        this.ctx.sdk.plan.resumeRoutines(),
      );
    }
    reportPresence(): Promise<void> {
      return viaSdk("/v1/me/presence", () =>
        this.ctx.sdk.plan.reportPresence(),
      );
    }
  }
  return Plan;
}

import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

/**
 * Subscription state and the Stripe hand-offs (C8) — the gateway's
 * `/v1/org/billing*` family (`cp/billing.ts`).
 */
export function BillingMixin<TBase extends BaseCtor>(Base: TBase) {
  class Billing extends Base {
    // ---- billing (C8) — hosted gateway only ----
    // Off-cloud (`this.cp === null`) there is no team/billing concept: the read
    // degrades to null (the billing UI renders nothing), while checkout/portal
    // throw — a write must reach the gateway.
    async getBilling(): Promise<controlPlane.BillingSummary | null> {
      if (!this.ctx.cp) return null;
      return controlPlane.getBilling(this.ctx.cp);
    }
    async createCheckout(
      interval: "monthly" | "annual",
    ): Promise<controlPlane.BillingCheckout> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return controlPlane.createCheckout(this.ctx.cp, interval);
    }
    async createPortal(): Promise<controlPlane.BillingCheckout> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return controlPlane.createPortal(this.ctx.cp);
    }
  }
  return Billing;
}

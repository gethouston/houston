import type * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * Subscription state and the Stripe hand-offs (C8) — the gateway's
 * `/v1/org/billing*` family, delegated to `sdk.billing`.
 *
 * The SDK throws on every non-2xx, so the one degradation this family has
 * (a not-entitled read) is applied HERE, on the status: the SDK is
 * deployment-agnostic and its contract tests pin the un-softened status, so
 * turning one into a null answer is web policy and belongs to the adapter.
 */
export function BillingMixin<TBase extends BaseCtor>(Base: TBase) {
  class Billing extends Base {
    // ---- billing (C8) — hosted gateway only ----
    // Off-cloud (`this.cp === null`) there is no team/billing concept: the read
    // degrades to null (the billing UI renders nothing), while checkout/portal
    // throw — a write must reach the gateway.
    //
    // On cloud the same null answers the three NOT-ENTITLED statuses: a gateway
    // that predates billing (404), a caller it refuses billing detail (403
    // `personal_space` or plain member), and a billing-off deployment (503
    // `billing not configured`: no `GW_STRIPE_*` set — every prod gateway with
    // no Stripe, and the kind loop, run this way). Softening that 503 here is
    // what keeps team entry from firing the red bug toast (HOU-904); every
    // other status is a real failure and throws.
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
    async createCheckout(
      interval: "monthly" | "annual",
    ): Promise<controlPlane.BillingCheckout> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return viaSdk("/v1/org/billing/checkout", () =>
        this.ctx.sdk.billing.createCheckout(interval),
      );
    }
    async createPortal(): Promise<controlPlane.BillingCheckout> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return viaSdk("/v1/org/billing/portal", () =>
        this.ctx.sdk.billing.createPortal(),
      );
    }
  }
  return Billing;
}

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

/**
 * An org's subscription, the Stripe hand-offs, the free-slot swap, and a free
 * org's routines and presence — the gateway's `/v1/org/billing*`,
 * `/v1/me/routines*` and `/v1/me/presence`, delegated to `sdk.billing`.
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
    // The promo-ended notice's two answers, for the active org's billing
    // owner. Off-cloud there is no subscription to change.
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
    // A free org's routine rules and presence ride the active org's header;
    // a host without them answers like any other gateway route.
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
    // The free-org pick is account-wide and cloud-only: off-cloud there is
    // nothing to pick, so the read is null like the summary above. Unlike the
    // summary, the gateway-without-the-route 404 is the SDK's own answer
    // (null), so the AI Manager reads the same thing the app does.
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

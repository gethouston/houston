import type { OrgsList, SeatCheckoutOutcome } from "@houston/wire-types";
import type { Clock } from "../../ports";
import {
  BILLING_CHECKOUT_RETURN_MS,
  BILLING_CHECKOUT_WINDOW_MS,
  type BillingCheckoutPorts,
  type BillingCheckoutReturnOutcome,
  type BillingCheckoutStart,
  type BillingCheckoutState,
  billingCheckoutOutstanding,
  orgPaidUp,
} from "./checkout-state";

export class BillingCheckoutTracker {
  #state: BillingCheckoutState = { phase: "idle" };
  #listeners = new Set<() => void>();
  #expiry: number | null = null;
  #returns = new Map<string, number>();
  #generation = 0;

  constructor(private readonly clock: Clock) {}

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): BillingCheckoutState => this.#state;

  async start(
    orgSlug: string,
    ports: BillingCheckoutPorts,
  ): Promise<BillingCheckoutStart> {
    if (billingCheckoutOutstanding(this.#state)) return "skipped";
    this.#set({ phase: "creating", orgSlug });
    const generation = this.#generation;
    let outcome: SeatCheckoutOutcome;
    try {
      outcome = await ports.create();
    } catch (error) {
      if (generation === this.#generation) this.#set({ phase: "idle" });
      throw error;
    }
    if (generation !== this.#generation) return "skipped";
    if (outcome.kind !== "checkout") {
      this.#set({ phase: "idle" });
      return outcome.kind;
    }
    const { url } = outcome;
    this.#returns.set(orgSlug, this.clock.now() + BILLING_CHECKOUT_RETURN_MS);
    this.#set({
      phase: "open",
      orgSlug,
      startedAt: this.clock.now(),
      url,
      opened: true,
    });
    this.#expiry = this.clock.setTimeout(() => {
      this.#expiry = null;
      if (this.#state.phase === "open") this.#set({ phase: "idle" });
    }, BILLING_CHECKOUT_WINDOW_MS);
    let opened = false;
    try {
      opened = await ports.open(url);
    } finally {
      if (
        !opened &&
        generation === this.#generation &&
        this.#state.phase === "open"
      )
        this.#set({ ...this.#state, opened: false });
    }
    return "started";
  }

  observe(orgs: OrgsList | undefined): boolean {
    const state = this.#state;
    if (state.phase !== "open" && state.phase !== "succeeded") return false;
    const org = orgs?.orgs.find((o) => o.slug === state.orgSlug);
    if (!org) return false;
    const paid = orgPaidUp(org.billing);
    if (state.phase === "succeeded") {
      if (!paid) this.#set({ phase: "idle" });
      return false;
    }
    if (!paid) return false;
    this.#clearExpiry();
    this.#set({ phase: "succeeded", orgSlug: state.orgSlug });
    return true;
  }

  claimReturn(orgSlug: string): boolean {
    const until = this.#returns.get(orgSlug);
    this.#returns.delete(orgSlug);
    return until !== undefined && until > this.clock.now();
  }

  returned(orgSlug: string, outcome: BillingCheckoutReturnOutcome): void {
    if (outcome === "cancel") this.abandon(orgSlug);
  }

  abandon(orgSlug: string): void {
    const state = this.#state;
    if (state.phase !== "open" || state.orgSlug !== orgSlug) return;
    this.#generation += 1;
    this.#clearExpiry();
    this.#set({ phase: "idle" });
  }

  reset(): void {
    this.#generation += 1;
    this.#clearExpiry();
    this.#returns.clear();
    if (this.#state.phase !== "idle") this.#set({ phase: "idle" });
  }

  #clearExpiry(): void {
    if (this.#expiry !== null) this.clock.clearTimeout(this.#expiry);
    this.#expiry = null;
  }

  #set(state: BillingCheckoutState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}

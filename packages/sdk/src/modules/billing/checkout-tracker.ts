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

/**
 * The ONE outstanding-checkout state of an app, shared by every entry point,
 * keyed by the org being paid for. A second start while one is outstanding is
 * refused, so a person can never open two Stripe sessions unless they end the
 * first themselves (`abandon`, or a cancel `returned`); the state outlives
 * whichever surface started it, so closing that surface neither stops the poll
 * nor loses the success. Subscribable in the `useSyncExternalStore` shape.
 */
export class BillingCheckoutTracker {
  #state: BillingCheckoutState = { phase: "idle" };
  #listeners = new Set<() => void>();
  #expiry: number | null = null;
  /** Org slug to the time its return stops being this app's to take. */
  #returns = new Map<string, number>();
  /**
   * Bumped by `reset` and `abandon`, so a start the previous identity or an
   * abandoned checkout began cannot land on whichever start comes next.
   */
  #generation = 0;

  constructor(private readonly clock: Clock) {}

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): BillingCheckoutState => this.#state;

  /**
   * Create the session for `orgSlug` and open it. Resolves `skipped` when a
   * checkout is already outstanding (nothing is sent) or `reset` ran while the
   * session was being created (it is never opened), and the refusal, back to
   * idle, when the gateway refused the interval; rejects, back to idle, when
   * the session cannot be created. The open state keeps the session's URL;
   * a browser that did not open it sets `opened: false`.
   */
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
      // A reset or start over while the browser was opening hands the state
      // to a later checkout, which must never inherit this session's flag.
      // The URL cannot tell them apart: the gateway answers the same
      // session within the hour.
      if (
        !opened &&
        generation === this.#generation &&
        this.#state.phase === "open"
      )
        this.#set({ ...this.#state, opened: false });
    }
    return "started";
  }

  /**
   * Feed every fresh orgs list. True exactly once, when the org this app opened
   * a checkout for is paid up (`orgPaidUp`): the moment to bring the window
   * forward. A success whose org stops being paid up returns to idle.
   */
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

  /**
   * Take the return page's hand-back for `orgSlug`: true once per checkout
   * this app opened in the last `BILLING_CHECKOUT_RETURN_MS`, whatever the
   * poll's phase, so a tab whose poll timed out still answers its own return.
   */
  claimReturn(orgSlug: string): boolean {
    const until = this.#returns.get(orgSlug);
    this.#returns.delete(orgSlug);
    return until !== undefined && until > this.clock.now();
  }

  /**
   * Feed a return from Stripe's page for `orgSlug`. A cancel ends that org's
   * open checkout, so its triggers come back at once; a success changes
   * nothing, since only the orgs list (`observe`) says the org is paid.
   */
  returned(orgSlug: string, outcome: BillingCheckoutReturnOutcome): void {
    if (outcome === "cancel") this.abandon(orgSlug);
  }

  /**
   * End `orgSlug`'s open checkout (start over): back to idle, its poll and
   * window stopped, so the next `start` makes a fresh session. The abandoned
   * page stays payable in the browser, and `observe` no longer watches it;
   * the orgs list still shows the org paid on its next read. Anything but an
   * open checkout for `orgSlug` is left alone.
   */
  abandon(orgSlug: string): void {
    const state = this.#state;
    if (state.phase !== "open" || state.orgSlug !== orgSlug) return;
    this.#generation += 1;
    this.#clearExpiry();
    this.#set({ phase: "idle" });
  }

  /**
   * Forget everything about the current checkout: the signed-in identity
   * changed, and the next account must not inherit its poll or its success.
   */
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

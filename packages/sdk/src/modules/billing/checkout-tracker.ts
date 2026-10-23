import type {
  OrgBilling,
  OrgsList,
  SeatCheckoutOutcome,
  SeatIntervalRefusal,
} from "@houston/wire-types";
import type { Clock } from "../../ports";

/**
 * How long a checkout this app opened stays outstanding: its triggers stay
 * disabled and the orgs list is polled until the org is paid for or this
 * elapses.
 */
export const BILLING_CHECKOUT_WINDOW_MS = 600_000;

export type BillingCheckoutState =
  | { phase: "idle" }
  | { phase: "creating"; orgSlug: string }
  | {
      phase: "open";
      orgSlug: string;
      startedAt: number;
      fallbackUrl: string | null;
    }
  | { phase: "succeeded"; orgSlug: string };

/** The two effects a checkout needs: the session from the gateway, a browser. */
export interface BillingCheckoutPorts {
  /** The session, or the interval the gateway refused (nothing opens). */
  create(): Promise<SeatCheckoutOutcome>;
  /** Opens the URL outside the app; false when nothing could open it. */
  open(url: string): Promise<boolean>;
}

/** A checkout is being created, or its page is open and the org is not paid yet. */
/** What one `start` did: opened a checkout, sent nothing, or was refused. */
export type BillingCheckoutStart = "started" | "skipped" | SeatIntervalRefusal;

export function billingCheckoutOutstanding(
  state: BillingCheckoutState,
): boolean {
  return state.phase === "creating" || state.phase === "open";
}

/**
 * Whether an org is paid for: paid, active, and no lock scheduled. A paid tier
 * alone is not enough, since a payment that failed keeps the tier and sets a
 * lock, and that must never read as a checkout that succeeded.
 */
export function orgPaidUp(billing: OrgBilling | null | undefined): boolean {
  return (
    billing?.tier === "paid" &&
    billing.status === "active" &&
    billing.lockAt === null
  );
}

/**
 * The ONE outstanding-checkout state of an app, shared by every entry point,
 * keyed by the org being paid for. A second start while one is outstanding is
 * refused, so a person can never open two Stripe sessions; the state outlives
 * whichever surface started it, so closing that surface neither stops the poll
 * nor loses the success. Subscribable in the `useSyncExternalStore` shape.
 */
export class BillingCheckoutTracker {
  #state: BillingCheckoutState = { phase: "idle" };
  #listeners = new Set<() => void>();
  #expiry: number | null = null;
  /** Bumped by `reset`, so a start the previous identity began cannot land. */
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
   * the session cannot be created. A browser that did not open leaves the URL
   * as `fallbackUrl` for the surface to offer as a link.
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
    this.#set({
      phase: "open",
      orgSlug,
      startedAt: this.clock.now(),
      fallbackUrl: null,
    });
    this.#expiry = this.clock.setTimeout(() => {
      this.#expiry = null;
      if (this.#state.phase === "open") this.#set({ phase: "idle" });
    }, BILLING_CHECKOUT_WINDOW_MS);
    let opened = false;
    try {
      opened = await ports.open(url);
    } finally {
      // A reset while the browser was opening belongs to the next identity:
      // its checkout (if any) must never inherit this session's link.
      if (
        !opened &&
        generation === this.#generation &&
        this.#state.phase === "open"
      )
        this.#set({ ...this.#state, fallbackUrl: url });
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
   * Forget everything about the current checkout: the signed-in identity
   * changed, and the next account must not inherit its poll or its success.
   */
  reset(): void {
    this.#generation += 1;
    this.#clearExpiry();
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

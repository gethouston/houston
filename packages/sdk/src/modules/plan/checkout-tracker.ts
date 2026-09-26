import type { PlanSummary } from "@houston/wire-types";
import type { Clock } from "../../ports";

/**
 * How long a Plus checkout this app opened stays outstanding: its triggers stay
 * disabled and the plan is polled until it turns Plus or this elapses.
 */
export const PLUS_CHECKOUT_WINDOW_MS = 600_000;

export type PlusCheckoutState =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "open"; startedAt: number; fallbackUrl: string | null }
  | { phase: "succeeded" };

/** The two effects a checkout needs: the session from the gateway, a browser. */
export interface PlusCheckoutPorts {
  create(): Promise<{ url: string }>;
  /** Opens the URL outside the app; false when nothing could open it. */
  open(url: string): Promise<boolean>;
}

/** A checkout is being created, or its page is open and the plan is not Plus yet. */
export function plusCheckoutOutstanding(state: PlusCheckoutState): boolean {
  return state.phase === "creating" || state.phase === "open";
}

/**
 * The ONE outstanding-checkout state of an app, shared by every entry point
 * (launch announcement, Billing, composer hint). A second start while one is
 * outstanding is refused, so a person can never open two Stripe sessions; the
 * state outlives whichever surface started it, so closing that surface neither
 * stops the plan poll nor loses the success. Subscribable in the
 * `useSyncExternalStore` shape.
 */
export class PlusCheckoutTracker {
  #state: PlusCheckoutState = { phase: "idle" };
  #listeners = new Set<() => void>();
  #expiry: number | null = null;
  /** Bumped by `reset`, so a start the previous identity began cannot land. */
  #generation = 0;

  constructor(private readonly clock: Clock) {}

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): PlusCheckoutState => this.#state;

  /**
   * Create the session and open it. Resolves false when a checkout is already
   * outstanding (nothing is sent) or `reset` ran while the session was being
   * created (it is never opened); rejects, back to idle, when the session
   * cannot be created. A browser that did not open leaves the URL as
   * `fallbackUrl` for the surface to offer as a link.
   */
  async start(ports: PlusCheckoutPorts): Promise<boolean> {
    if (plusCheckoutOutstanding(this.#state)) return false;
    this.#set({ phase: "creating" });
    const generation = this.#generation;
    let url: string;
    try {
      ({ url } = await ports.create());
    } catch (error) {
      if (generation === this.#generation) this.#set({ phase: "idle" });
      throw error;
    }
    if (generation !== this.#generation) return false;
    this.#set({
      phase: "open",
      startedAt: this.clock.now(),
      fallbackUrl: null,
    });
    this.#expiry = this.clock.setTimeout(() => {
      this.#expiry = null;
      if (this.#state.phase === "open") this.#set({ phase: "idle" });
    }, PLUS_CHECKOUT_WINDOW_MS);
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
    return true;
  }

  /**
   * Feed every fresh plan read. True exactly once, when the checkout this app
   * opened sees the plan turn Plus: the moment to bring the window forward.
   */
  observe(plan: PlanSummary | undefined): boolean {
    if (this.#state.phase === "succeeded" && plan?.plan === "free") {
      this.#set({ phase: "idle" });
      return false;
    }
    if (this.#state.phase !== "open" || plan?.plan !== "plus") return false;
    this.#clearExpiry();
    this.#set({ phase: "succeeded" });
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

  #set(state: PlusCheckoutState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}

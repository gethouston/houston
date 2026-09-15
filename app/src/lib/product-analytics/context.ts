/**
 * The device identity stamped on every batch.
 *
 * Three of its four fields are known the moment the app is running. The
 * fourth, `install_id`, lives in the preference store and is read through the
 * engine, so it lands one async hop later — and a flush must never wait for
 * it: a quit-time goodbye has milliseconds, and an event that misses its ride
 * is gone for good. So the first batch of a launch starts the read and ships
 * without the id; every batch after it lands carries it. An install id the
 * gateway never receives simply leaves that batch unattributed to a device,
 * which is the cheap half of the trade.
 *
 * Dependency-injected end to end so the whole policy is testable with no
 * preference store, no gateway and no browser.
 */

import type { ProductAnalyticsContext } from "./wire.ts";

export interface ProductAnalyticsContextDeps {
  /** The per-launch id PostHog stamps too (`analyticsSessionId`). */
  sessionId(): string;
  appVersion: string;
  platform(): "desktop" | "web";
  /** Reads this install's id. Called once per launch, on the first batch. */
  readInstallId(): Promise<string>;
  /** Where a refused read goes — it is unexpected, so it must be reported. */
  onInstallIdFailure(error: unknown): void;
}

/**
 * Returns the builder for one batch's context. Calling it is synchronous and
 * always succeeds; the install-id read it kicks off on the first call is what
 * fills in the last field, for the batches that come after.
 */
export function createProductAnalyticsContext(
  deps: ProductAnalyticsContextDeps,
): () => ProductAnalyticsContext {
  let installId: string | undefined;
  let reading = false;

  function startReading(): void {
    if (reading || installId !== undefined) return;
    reading = true;
    void deps.readInstallId().then(
      (id) => {
        installId = id;
      },
      (error: unknown) => {
        // One attempt per launch: a store that refused once refuses for the
        // same reason on the next batch, and retrying would report it again.
        deps.onInstallIdFailure(error);
      },
    );
  }

  return () => {
    startReading();
    return {
      session_id: deps.sessionId(),
      app_version: deps.appVersion,
      platform: deps.platform(),
      // Omitted, never null: the route reads an absent id as "not known yet".
      ...(installId === undefined ? {} : { install_id: installId }),
    };
  };
}

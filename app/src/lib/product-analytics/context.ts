/**
 * The device identity stamped on every batch.
 *
 * Three of its four fields are known the moment the app is running. The
 * fourth, `install_id`, is BEST-EFFORT: it lives in the preference store and is
 * read through the engine, so it lands one async hop later — and a flush must
 * never wait for it, because a quit-time goodbye has milliseconds and an event
 * that misses its ride is gone for good. So the first batch of a launch starts
 * the read and ships without the id; every batch after it lands carries it. An
 * install id the gateway never receives simply leaves that batch unattributed
 * to a device, which is the cheap half of the trade.
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
  /**
   * Reads this install's id. Called once per launch, on the first batch.
   * {@link createInstallIdReader} is the one the app wires in: it settles only
   * when the id is genuinely known, so a launch that never reaches an engine
   * simply never answers and every batch ships without the field.
   */
  readInstallId(): Promise<string>;
}

export interface InstallIdReaderDeps {
  /** Resolves once the engine is bootstrapped (`lib/engine.ts`). */
  whenEngineReady(): Promise<void>;
  /** This install's stored id, read through the engine (`lib/install-id.ts`). */
  readStoredId(): Promise<string>;
}

/**
 * The install-id read the sink uses. Waiting for the engine IS the point: the
 * store read MINTS a fresh id and caches it for the whole process when it
 * cannot reach the preference store, so a batch flushed before the engine
 * bootstraps — the sink is mounted above `<EngineGate>`, and an
 * `app_error_shown` while offline can flush there — would fabricate an install
 * id that then re-fires `install_created` and re-opens the website's welcome
 * bridge for a device that was never new.
 */
export function createInstallIdReader(
  deps: InstallIdReaderDeps,
): () => Promise<string> {
  return async () => {
    await deps.whenEngineReady();
    return deps.readStoredId();
  };
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
    // One read per launch. Nothing catches here on purpose: the reader is
    // documented not to reject, so a rejection is a bug, and it belongs to the
    // global unhandled-rejection handler that reports it — not to a branch
    // here that would swallow it.
    void deps.readInstallId().then((id) => {
      installId = id;
    });
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

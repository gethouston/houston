/**
 * The web surface's boot beat, the counterpart of `startup-analytics.ts` on
 * desktop. The desktop routine cannot serve here: it mints and reads the
 * install identity, which is a device concept, and the web tree deliberately
 * never runs it.
 *
 * What the web tree does owe the funnel is the launch itself. `session_started`
 * is the beat every later one is counted against, and without it a visit that
 * arrived from the marketing site, signed in and then read a screen or two
 * produces no batch at all — so the visitor id the link carried
 * (`web-visitor-landing.ts`) reaches the gateway on no batch either, and the
 * visit stops at the sign-in page as far as the funnel can tell.
 *
 * The beat goes out on the app's analytics bus like every other tracked event,
 * which is what the product-analytics sink listens to
 * (`product-analytics/sink.ts`) — there is no second event source. The sink
 * itself decides whether this deployment has anywhere to ship it, and the queue
 * holds it until a bearer exists, so a visit that never signs in sends nothing.
 */

export interface WebSessionStartDeps {
  /** `analytics.track` — the one way an event reaches the bus. */
  track(name: "session_started"): void;
  /**
   * Takes the visitor id out of the boot URL (`readWebVisitorId`). Called
   * here, before the first event, so the address bar is clean from the launch
   * on rather than from whenever the first batch happens to flush.
   */
  captureVisitor(): string | null;
}

/**
 * Builds this tab's boot beat. It fires on the first call and never again: a
 * reload is a new tab-load and a new launch, but a remount within one is the
 * same launch, and two `session_started`s would double every session count
 * that follows.
 */
export function createWebSessionStart(deps: WebSessionStartDeps): () => void {
  let started = false;
  return () => {
    if (started) return;
    started = true;
    deps.captureVisitor();
    deps.track("session_started");
  };
}

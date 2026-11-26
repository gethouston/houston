/**
 * The (status, reason) pairs the gateway and host mint for "the agent's pod
 * is not there right now": waking, restarting (a release roll, a drain), its
 * runtime still booting, or its id latched while a rename moves its directory
 * (PRODUCT-1804). The SAME request succeeds once the pod is back. Keyed on the
 * exact pairs, never on a bare 502/503: a provider quota page on the same
 * status is a real failure. The web adapter's `isEngineWakingError` reads the
 * same pairs across every client error shape. The read-only "agent data
 * temporarily unavailable" 503 is deliberately left out: it only arrives on
 * reads, which these pairs do not cover, and it is not a wake.
 */
export function isWakingAnswer(status: number, reason: string): boolean {
  if (status === 503) {
    return (
      reason === "engine unavailable" ||
      reason === "the agent's runtime is still starting, try again shortly" ||
      // A host draining (roll, eviction, app quit): the request belongs to the
      // replacement pod (PRODUCT-1777).
      reason === "the host is shutting down; retry shortly"
    );
  }
  return status === 502 && reason === "engine proxy failed";
}

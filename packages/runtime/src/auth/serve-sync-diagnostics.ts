import type { ServeProbe } from "./serve-probe";

/** Why a sync dropped a credential — the second half of its diagnostic. */
export const NOT_CONNECTED = "central says not connected";
export const DEAD_KEY = "the served key cannot authenticate";

export type Removal = { id: string; reason: string };

/**
 * The counterpart of the applied line: what this sync DELETED, and why. Without
 * it a workspace going disconnected showed up only as a provider silently
 * absent from the applied line, so the pod-side record could not say whether
 * the central store disowned it or a probe simply failed to answer. Grouped by
 * reason (one line each) and printed only when something was actually removed —
 * every ordinary sync stays a single line.
 */
export function logRemovals(removed: Removal[]): void {
  const byReason = new Map<string, string[]>();
  for (const { id, reason } of removed)
    byReason.set(reason, [...(byReason.get(reason) ?? []), id]);
  for (const [reason, ids] of byReason)
    console.log(
      `[serve] removed central credentials: ${ids.join(", ")} (reason: ${reason})`,
    );
}

/**
 * The shared detail when EVERY probe (of at least two) errored the same way,
 * else undefined. A lone failing provider is that provider's incident.
 */
export function uniformFailureDetail(probes: ServeProbe[]): string | undefined {
  const first = probes[0];
  if (probes.length < 2 || !first || first.state !== "error") return undefined;
  return probes.every((p) => p.state === "error" && p.detail === first.detail)
    ? first.detail
    : undefined;
}

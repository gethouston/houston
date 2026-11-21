import type { ServeProbe } from "./serve-probe";

export const NOT_CONNECTED = "central says not connected";
export const DEAD_KEY = "the served key cannot authenticate";

export type Removal = { id: string; reason: string };

export function logRemovals(removed: Removal[]): void {
  const byReason = new Map<string, string[]>();
  for (const { id, reason } of removed)
    byReason.set(reason, [...(byReason.get(reason) ?? []), id]);
  for (const [reason, ids] of byReason)
    console.log(
      `[serve] removed central credentials: ${ids.join(", ")} (reason: ${reason})`,
    );
}

export function uniformFailureDetail(probes: ServeProbe[]): string | undefined {
  const first = probes[0];
  if (probes.length < 2 || !first || first.state !== "error") return undefined;
  return probes.every((p) => p.state === "error" && p.detail === first.detail)
    ? first.detail
    : undefined;
}

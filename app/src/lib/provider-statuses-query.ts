/**
 * Pure query-shape rules for the CHAT PICKER's provider-status query
 * (`hooks/use-provider-statuses.ts`), split out so the space-safety gate is
 * unit-testable without a React renderer or a QueryClient.
 *
 * Why a gate exists at all (HOU-979): the status probe routes PER AGENT (the
 * engine adapter picks the agent whose runtime it asks, and the gateway pins
 * the space with `x-houston-org`). A space switch wipes the query cache
 * (`lib/space-cache.ts`), which immediately refires this query — but the
 * adapter has no validated agent list for the NEW space until `loadAgents`
 * re-resolves. The probe would then ask
 * `/v1/agents/<old-agent>/providers` under the NEW org header, gets 404/403,
 * and every provider comes back `unknown` — which used to leave the picker
 * showing nothing at all until the next `ProviderLoginComplete`.
 *
 * The sibling AI-hub hook (`hooks/provider-connections/use-provider-statuses.ts`)
 * already gates its re-probe on the new space's agents having settled; these
 * helpers give the picker the SAME gate plus a space-scoped query key, so the
 * two hooks cannot drift apart again.
 */

import { scanIsUnreachable } from "../hooks/provider-connections/unreachable-scan.ts";
import type { ProviderStatus } from "./tauri.ts";

/** The agent-store signals the gate reads. */
export interface AgentsSettledSignals {
  /** True once `loadAgents` has settled at least once (even on failure). */
  loaded: boolean;
  /** True while a `loadAgents` is in flight. */
  loading: boolean;
}

/**
 * Whether the CURRENT space's agent list has settled, so a per-agent provider
 * probe would be routed at this space's agents rather than the previous one's.
 *
 * `loaded` alone is not enough: it stays true across a switch while the
 * re-`loadAgents` runs, which is exactly the window the misrouted probe fired
 * in. Both signals together mean "settled, for this space".
 */
export function providerProbeReady(agents: AgentsSettledSignals): boolean {
  return agents.loaded && !agents.loading;
}

/**
 * The picker's status query key.
 *
 * `workspaceId` is folded in because provider connections are TENANT data while
 * the space is only a request header: without it, personal and team collide on
 * one key, so a switch could serve the previous space's statuses via
 * stale-while-revalidate. A distinct key per space means the new space starts
 * from no data (a visible "checking"), never from another tenant's answer.
 *
 * `catalogUpdatedAt` stays in the key so statuses are re-probed for the FULL
 * provider set the moment the pi-ai catalog hydrates `PROVIDERS` in place.
 */
export function providerStatusesQueryKey(opts: {
  base: readonly string[];
  catalogUpdatedAt: number;
  workspaceId: string | null;
}): readonly unknown[] {
  return [...opts.base, opts.catalogUpdatedAt, opts.workspaceId];
}

/**
 * Whether the picker should render its neutral "checking" state.
 *
 * A disabled query is NOT "loading" as far as TanStack is concerned (it is
 * pending but not fetching), so reading `query.isLoading` alone would report
 * "settled with no statuses" during the gate's window — and the picker filters
 * unconnected providers out, so it would paint an empty list and an honest-
 * looking "no providers connected" empty state at the exact moment we know
 * nothing. While the gate is closed and no data has arrived, we ARE checking.
 */
export function providerStatusesLoading(opts: {
  hasData: boolean;
  queryIsLoading: boolean;
  probeReady: boolean;
}): boolean {
  if (opts.hasData) return false;
  return opts.queryIsLoading || !opts.probeReady;
}

/**
 * What a resolved `checkAllStatuses` scan is actually worth (HOU-1153).
 *
 * The engine adapter's batched `providerStatuses()` NEVER rejects: an
 * unreachable engine (a host still booting, a cold pod, a wedged sidecar), and
 * the window where per-agent routing has not settled, both resolve every
 * provider as `unknown`. That shape is indistinguishable from a fetch that
 * succeeded, so the picker's query settled "successfully" knowing nothing —
 * `unknown` renders as `checking`, and the picker spun on "Loading providers…"
 * for good while the connect-AI composer (which fails closed on anything
 * `checking`) never appeared.
 *
 * So the picker classifies the RESULT instead of trusting the resolution. An
 * all-unknown scan is a probe FAILURE and must be thrown, which is what buys
 * the retry, the honest error state, and the re-probe below.
 *
 * The AI hub's sibling hook keeps consuming the raw all-unknown shape on
 * purpose — it has a last-known painted snapshot to protect, so it drops the
 * scan silently rather than surfacing a failure.
 */
export type StatusScanClassification = "definitive" | "unreachable";

/** Classify a scan; see {@link StatusScanClassification}. */
export function classifyStatusScan(
  probedIds: readonly string[],
  byId: Record<string, ProviderStatus>,
): StatusScanClassification {
  return scanIsUnreachable(probedIds, byId) ? "unreachable" : "definitive";
}

/** The rejection an unreachable scan produces, so the failure is typed rather
 *  than a bare string the UI would have to pattern-match. */
export class ProviderProbeUnreachableError extends Error {
  constructor() {
    super("Could not reach the engine to check provider connections.");
    this.name = "ProviderProbeUnreachableError";
  }
}

/** How often the picker re-probes while the last answer was a failure. Short
 *  enough that a host which was merely booting is picked up within a beat of
 *  becoming ready, long enough not to hammer one that is genuinely down. */
export const PROVIDER_STATUS_REPROBE_MS = 5_000;

/**
 * The self-heal timer (HOU-1153): while the last probe FAILED, keep re-probing;
 * the moment a definitive answer lands, stop.
 *
 * This is what closes the loop with no user action — a host that answered
 * "still booting" is reachable seconds later, and the next tick lands the real
 * statuses. `pending` deliberately gets no timer: TanStack's own retry/backoff
 * owns the first-fetch window, and a second schedule on top of it would stack
 * overlapping probes.
 */
export function providerStatusesRefetchInterval(query: {
  status: "pending" | "error" | "success";
}): number | false {
  return query.status === "error" ? PROVIDER_STATUS_REPROBE_MS : false;
}

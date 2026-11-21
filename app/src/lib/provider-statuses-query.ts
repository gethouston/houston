import { scanIsUnreachable } from "../hooks/provider-connections/unreachable-scan.ts";
import type { ProviderStatus } from "./tauri.ts";

export interface AgentsSettledSignals {
  loaded: boolean;
  loading: boolean;
}

export function providerProbeReady(agents: AgentsSettledSignals): boolean {
  return agents.loaded && !agents.loading;
}

export function providerStatusesQueryKey(opts: {
  base: readonly string[];
  providerIds: readonly string[];
  workspaceId: string | null;
}): readonly unknown[] {
  return [...opts.base, opts.providerIds, opts.workspaceId];
}

export function providerStatusesLoading(opts: {
  hasData: boolean;
  queryIsLoading: boolean;
  probeReady: boolean;
}): boolean {
  if (opts.hasData) return false;
  return opts.queryIsLoading || !opts.probeReady;
}

export type StatusScanClassification = "definitive" | "unreachable";

export function classifyStatusScan(
  probedIds: readonly string[],
  byId: Record<string, ProviderStatus>,
): StatusScanClassification {
  return scanIsUnreachable(probedIds, byId) ? "unreachable" : "definitive";
}

export class ProviderProbeUnreachableError extends Error {
  constructor() {
    super("Could not reach the engine to check provider connections.");
    this.name = "ProviderProbeUnreachableError";
  }
}

export const PROVIDER_STATUS_REPROBE_MS = 5_000;

export function providerStatusesRefetchInterval(query: {
  status: "pending" | "error" | "success";
}): number | false {
  return query.status === "error" ? PROVIDER_STATUS_REPROBE_MS : false;
}

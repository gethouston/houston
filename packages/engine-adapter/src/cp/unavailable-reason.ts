const ENGINE_UNAVAILABLE = "engine unavailable";
const ENGINE_PROXY_FAILED = "engine proxy failed";
const NOT_CONFIGURED = "not_configured";
const RUNTIME_STILL_STARTING =
  "the agent's runtime is still starting, try again shortly";
const HOST_SHUTTING_DOWN = "the host is shutting down; retry shortly";
export const SHARED_SKILLS_UNCONFIGURED = "shared skills not configured";

export type UnavailableReason =
  | "engine-waking"
  | "pod-unreachable"
  | "feature-absent"
  | "handoff";

export const HANDOFF_RETRY_DELAYS_MS = [500, 1_500] as const;

export const WAKE_RETRY_DELAYS_MS = [2_000, 3_000, 5_000, 5_000] as const;

const NO_RETRY_DELAYS_MS = [] as const;

export function classifyUnavailableBody(body: unknown): UnavailableReason {
  const b = body as { error?: unknown; code?: unknown } | null;
  if (b?.code === NOT_CONFIGURED) return "feature-absent";
  if (b?.error === SHARED_SKILLS_UNCONFIGURED) return "feature-absent";
  if (b?.error === ENGINE_UNAVAILABLE) return "engine-waking";
  if (b?.error === ENGINE_PROXY_FAILED) return "pod-unreachable";
  if (b?.error === RUNTIME_STILL_STARTING) return "engine-waking";
  if (b?.error === HOST_SHUTTING_DOWN) return "engine-waking";
  return "handoff";
}

export function retryDelaysFor(reason: UnavailableReason): readonly number[] {
  switch (reason) {
    case "engine-waking":
    case "pod-unreachable":
      return WAKE_RETRY_DELAYS_MS;
    case "feature-absent":
      return NO_RETRY_DELAYS_MS;
    case "handoff":
      return HANDOFF_RETRY_DELAYS_MS;
  }
}

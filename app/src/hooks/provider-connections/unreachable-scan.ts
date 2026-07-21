import type { ProviderStatus } from "../../lib/tauri";

/**
 * Whether a `checkAllStatuses` scan carries no information because the engine
 * was unreachable (the adapter reports every gateway as `auth_state:
 * "unknown"` — a cold pod still waking after a relaunch/update, a network
 * drop). Such a scan must not overwrite the painted last-known snapshot or
 * the persisted status cache, and must not drive connect-transition
 * analytics.
 */
export function scanIsUnreachable(
  gatewayIds: readonly string[],
  byId: Record<string, ProviderStatus>,
): boolean {
  return (
    gatewayIds.length > 0 &&
    gatewayIds.every((id) => byId[id]?.auth_state === "unknown")
  );
}

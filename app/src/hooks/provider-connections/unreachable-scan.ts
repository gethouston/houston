import type { ProviderStatus } from "../../lib/tauri";

export function scanIsUnreachable(
  gatewayIds: readonly string[],
  byId: Record<string, ProviderStatus>,
): boolean {
  return (
    gatewayIds.length > 0 &&
    gatewayIds.every((id) => byId[id]?.auth_state === "unknown")
  );
}

import type { Agent } from "./types";

/** Local-only integration branch: credential sync to cloud is disabled. */
export function canSyncProviderCredentialsToCloud(_providerId: string): boolean {
  return false;
}

export async function syncProviderCredentialsToCloudAgentSafe(
  _agent: Agent,
  _providerId: string,
): Promise<{ ok: false; reason: "no_local_credentials"; message?: string }> {
  return { ok: false, reason: "no_local_credentials" };
}

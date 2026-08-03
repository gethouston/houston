import { isExpiring } from "../credentials/refresh";
import {
  CredentialGoneError,
  sharedCredentialRefresher,
} from "../credentials/refresh-coalescer";
import type { WorkspaceCredential } from "../ports";
import type { TurnDeps } from "./deps";

/**
 * The workspace's credential for `provider`, refreshed centrally when expiring
 * (an API-key credential never expires, so it's served as-is). Null = the
 * workspace hasn't connected that provider.
 *
 * The refresh goes through the process-wide coalescer — the SAME one the serve
 * route uses. Rotating providers (openai-codex) invalidate the old refresh token
 * on every use, so a private rotator here would race the serve path: the first
 * exchange wins, the loser gets `invalid_grant`, and the user's provider
 * disconnects itself. `deps.refresh` rides along as this call's refresher, so
 * the dependency bundle stays injectable without owning a second flight.
 */
export async function freshCredential(
  deps: TurnDeps,
  wsId: string,
  provider: string,
): Promise<WorkspaceCredential | null> {
  const cred = await deps.credentials.get(wsId, provider);
  if (!cred) return null;
  if (!isExpiring(cred)) return cred;
  try {
    return await sharedCredentialRefresher.run({
      workspaceId: wsId,
      provider,
      load: () => deps.credentials.get(wsId, provider),
      persist: (c) => deps.credentials.put(c),
      doRefresh: deps.refresh,
    });
  } catch (err) {
    // Disconnected mid-flight: nothing was refreshed or written, and the answer
    // is the same one an absent row gives — this workspace has no credential.
    if (err instanceof CredentialGoneError) return null;
    throw err;
  }
}

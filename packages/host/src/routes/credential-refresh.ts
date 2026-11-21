import { ProviderAccountBlockedError } from "../credentials/account-blocked";
import { disconnectRejectedCredential } from "../credentials/disconnect";
import { RefreshRejectedError } from "../credentials/oauth-token-exchange";
import { isExpiring } from "../credentials/refresh";
import {
  CredentialGoneError,
  sharedCredentialRefresher,
} from "../credentials/refresh-coalescer";
import type { WorkspaceId } from "../domain/types";
import type {
  CredentialActing,
  CredentialStore,
  WorkspaceCredential,
} from "../ports";

const SERVE_VALIDITY_SKEW_MS = 6 * 60 * 1000;

export type ServeCandidate =
  | { cred: WorkspaceCredential }
  | { notConnected: string }
  | { blocked: ProviderAccountBlockedError };

export async function refreshedForServe(
  credentials: CredentialStore,
  workspaceId: WorkspaceId,
  cred: WorkspaceCredential,
  acting: CredentialActing | undefined,
): Promise<ServeCandidate> {
  if (!isExpiring(cred, SERVE_VALIDITY_SKEW_MS) || !cred.refreshToken)
    return { cred };
  const refreshing = cred.provider;
  try {
    return {
      cred: await sharedCredentialRefresher.run({
        workspaceId,
        provider: refreshing,
        acting,
        load: () => credentials.get(workspaceId, refreshing, acting),
        persist: (c) => credentials.put(c, acting),
        skewMs: SERVE_VALIDITY_SKEW_MS,
      }),
    };
  } catch (err) {
    if (err instanceof ProviderAccountBlockedError) {
      if (!isExpiring(cred, 0)) return { cred };
      return { blocked: err };
    }
    if (err instanceof CredentialGoneError) {
      return { notConnected: "workspace not connected" };
    }
    if (err instanceof RefreshRejectedError) {
      const superseding = await disconnectRejectedCredential({
        credentials,
        workspaceId,
        rejected: cred,
        acting,
        reason: err.message,
      });
      if (!superseding)
        return {
          notConnected: `${cred.provider} session ended; reconnect the provider`,
        };
      return { cred: superseding };
    }
    console.error(
      `[sandbox/credential] refresh failed for ${cred.provider}, serving existing token:`,
      err instanceof Error ? err.message : err,
    );
    return { cred };
  }
}

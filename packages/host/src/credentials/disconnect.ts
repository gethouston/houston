import { accessDigest } from "@houston/protocol/access-digest";
import type { WorkspaceId } from "../domain/types";
import type {
  CredentialActing,
  CredentialStore,
  WorkspaceCredential,
} from "../ports";
import { sharedCredentialRefresher } from "./refresh-coalescer";
import {
  type RevocationTombstones,
  sharedRevocationTombstones,
} from "./revocation-tombstones";

export async function disconnectRejectedCredential(args: {
  credentials: CredentialStore;
  workspaceId: WorkspaceId;
  rejected: WorkspaceCredential;
  acting?: CredentialActing;
  reason: string;
  revocations?: RevocationTombstones;
}): Promise<WorkspaceCredential | null> {
  const { credentials, workspaceId, rejected, acting } = args;
  const deadDigest = accessDigest(rejected.accessToken);
  const dropped = await credentials.removeIfAccess(
    workspaceId,
    rejected.provider,
    deadDigest,
    { scope: rejected.scope, ...acting },
  );
  sharedCredentialRefresher.forget(workspaceId, rejected.provider, acting);
  if (dropped) {
    (args.revocations ?? sharedRevocationTombstones).mark({
      workspaceId,
      provider: rejected.provider,
      scope: rejected.scope === "personal" ? "personal" : "team",
      actingAs: acting?.actingAs,
    });
    console.error(
      `[credential-disconnect] refresh token rejected for ${rejected.provider}, disconnecting:`,
      args.reason,
    );
    return null;
  }
  const current = await credentials
    .get(workspaceId, rejected.provider, acting)
    .catch((error: unknown) => {
      console.error(
        `[credential-disconnect] could not re-read the ${rejected.provider} credential after a rejected refresh:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    });
  if (current && accessDigest(current.accessToken) !== deadDigest) {
    console.info(
      `[credential-disconnect] refresh token rejected for ${rejected.provider}, but the stored credential changed underneath: leaving it in place`,
    );
    return current;
  }
  console.info(
    `[credential-disconnect] refresh token rejected for ${rejected.provider}; the stored credential is`,
    current ? "still the rejected one" : "already gone",
  );
  return null;
}

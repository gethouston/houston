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

/**
 * What the control plane does when the OAuth server rejects a refresh TOKEN
 * (invalid_grant / refresh_token_invalidated — see oauth-token-exchange.ts).
 * That verdict never heals on retry: the credential is dead until the user
 * reconnects, and leaving it in place loops the same rejection on every serve
 * while turns fail on an expired access token.
 *
 * So the credential goes — but only the one that was rejected. This is the same
 * rule the revoked-token report follows (HOU-952): the rejection condemns
 * exactly the credential the refresher was handed, and time passes between
 * reading it and the endpoint answering. A reconnect, or a sibling host that
 * rotated the token in that window, leaves a VALID row here; an unconditional
 * delete would sign the user out of the connection they just made. The digest
 * names the dead token, so compare-and-delete can drop it and nothing else.
 */
export async function disconnectRejectedCredential(args: {
  credentials: CredentialStore;
  workspaceId: WorkspaceId;
  /** The credential whose refresh was rejected — the only one this may drop. */
  rejected: WorkspaceCredential;
  /** WHOSE credential it is (HOU-976); undefined = the shared team row. */
  acting?: CredentialActing;
  /** The rejection's message, for the disconnect log line. */
  reason: string;
  /** Injectable for tests; defaults to the process-wide ledger. */
  revocations?: RevocationTombstones;
}): Promise<WorkspaceCredential | null> {
  const { credentials, workspaceId, rejected, acting } = args;
  // The digest names the DEAD token. The caller hands us the credential IT
  // read, which the coalescer may have re-read and rotated past in the same
  // cycle — digesting the caller's copy is the fail-safe direction: a mismatch
  // deletes nothing, and the next serve re-reads and settles the question.
  const deadDigest = accessDigest(rejected.accessToken);
  const dropped = await credentials.removeIfAccess(
    workspaceId,
    rejected.provider,
    deadDigest,
    // The scope says WHICH kind of row; the acting identity says WHOSE.
    { scope: rejected.scope, ...acting },
  );
  // Either way this key's coalesced state is worthless: a dropped credential
  // must never be served from the result cache, and a superseded one has to be
  // re-read rather than refreshed again with the token just rejected.
  sharedCredentialRefresher.forget(workspaceId, rejected.provider, acting);
  if (dropped) {
    // A rejected refresh token is as terminal as a provider revocation, and
    // the same automatic refills (an if_absent snapshot push, fallback
    // adoption, the healer) would loop it: fill → next serve refreshes with
    // the superseded token → invalid_grant → disconnect → fill again
    // (HOU-855's poison cycle, HOUSTON-APP-530's volume). Tombstone it so
    // only a real reconnect brings the provider back.
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
  // The store moved on under us — the rejection was about a credential nobody
  // holds any more. Hand back what the store holds NOW so the caller can serve
  // it (through its own checks); null when the row is simply gone. This read
  // runs inside the serve route's catch, so a gateway blip here must read as
  // "absent" rather than escape as a 500 in place of the marked 404 the runtime
  // knows how to act on.
  const current = await credentials
    .get(workspaceId, rejected.provider, acting)
    .catch((error: unknown) => {
      console.error(
        `[credential-disconnect] could not re-read the ${rejected.provider} credential after a rejected refresh:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    });
  // RemoteCredentialStore answers `get` from a short-lived cache, so this read
  // can return the VERY credential the endpoint just rejected. That is not a
  // supersession — it is confirmation the dead token is still the stored one,
  // and serving it would loop the same rejection on every turn.
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

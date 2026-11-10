import {
  CLAIMED_TURN_LISTING_SCOPE,
  type HydrateListing,
  type ObjectMetadata,
  type ObjectStore,
  PrefetchedObjectStore,
} from "@houston/runtime-client/object-sync";
import { type ClaimedStoreScope, claimedStoreScope } from "./turn-store-scope";
import {
  listClaimedTree,
  type StoreLister,
  storeLister,
} from "./turn-store-walk";

/** A claimed turn's listing (turn-store-scope.ts). */
export type ClaimedTurnListing = HydrateListing;

const AGENT_ROOT = /^workspaces\/[^/]+\/[^/]+$/;

/**
 * List only what a claimed turn needs (turn-store-scope.ts), from the
 * gateway's scoped prefetch or by walking the store a level at a time.
 * Undefined: hydrate lists the store whole, as before. That is a whole-store
 * prefetch (already listed), a store or pod-store that cannot list one level,
 * and any tree that is not exactly one standing agent.
 */
export async function listClaimedTurnStore(opts: {
  store: ObjectStore;
  prefix: string;
  conversationId: string;
}): Promise<ClaimedTurnListing | undefined> {
  const { store, prefix, conversationId } = opts;
  const lister = storeLister(store, prefix);
  if (store instanceof PrefetchedObjectStore) {
    if (store.servesWholeListing) return undefined;
    const scoped = store.takeScopedListing();
    if (
      lister &&
      scoped?.scope === CLAIMED_TURN_LISTING_SCOPE &&
      AGENT_ROOT.test(scoped.agentRoot)
    ) {
      const scope = claimedStoreScope(scoped.agentRoot, conversationId);
      const objects = scoped.objects.filter((object) =>
        scope.critical(lister.relOf(object.key)),
      );
      return claimedListing(lister, scope, objects, (signal) =>
        lister.listLater(scope, undefined, signal),
      );
    }
  }
  if (!lister) return undefined;
  const walked = await listClaimedTree(lister, conversationId);
  if (!walked) return undefined;
  return claimedListing(lister, walked.scope, walked.objects, (signal) =>
    lister.listLater(walked.scope, walked.laterDirs, signal),
  );
}

function claimedListing(
  lister: StoreLister,
  scope: ClaimedStoreScope,
  objects: ObjectMetadata[],
  listLater: (signal: AbortSignal) => Promise<ObjectMetadata[]>,
): ClaimedTurnListing {
  return {
    objects,
    reads: [lister.keyOf(scope.conversation)],
    // Hydration starts it once the critical listing is in, so the agent's
    // own folders never slow the listing the prompt waits on, and its signal
    // stops it when the turn abandons those folders.
    later: listLater,
  };
}

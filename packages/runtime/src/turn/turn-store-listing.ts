import {
  type HydrateListing,
  type ObjectMetadata,
  type ObjectStore,
  PrefetchedObjectStore,
} from "@houston/runtime-client/object-sync";
import type { ClaimedStoreScope } from "./turn-store-scope";
import {
  listClaimedTree,
  type StoreLister,
  storeLister,
} from "./turn-store-walk";

export type ClaimedTurnListing = HydrateListing;

export async function listClaimedTurnStore(opts: {
  store: ObjectStore;
  prefix: string;
  conversationId: string;
}): Promise<ClaimedTurnListing | undefined> {
  const { store, prefix, conversationId } = opts;
  const lister = storeLister(store, prefix);
  if (store instanceof PrefetchedObjectStore && store.servesListing)
    return undefined;
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
    later: listLater,
  };
}

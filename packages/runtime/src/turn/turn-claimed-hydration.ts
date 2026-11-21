import {
  type ObjectStore,
  STORE_ROOT_PACKAGE_EXCLUDES,
} from "@houston/runtime-client/object-sync";
import { deferredWorkspaceFile } from "./turn-deferred-files";
import {
  DEFERRED_PARALLEL,
  DEFERRED_READ_TIMEOUT_MS,
} from "./turn-deferred-watch";
import { startTurnFilesystem } from "./turn-filesystem";
import { ownClaudeFlagsOnly, ownConversationOnly } from "./turn-hot-set";
import { turnHydrationError } from "./turn-hydration-error";
import {
  type ClaimedTurnListing,
  listClaimedTurnStore,
} from "./turn-store-listing";
import type { TurnRequest } from "./types";

export const CLAIMED_TURN_EXCLUDES: readonly string[] = [
  ...STORE_ROOT_PACKAGE_EXCLUDES,
  "workspaces/*/*/.houston/runtime/runtime.log",
  "claude-login/",
  "workspaces/*/*/.houston/runtime/sessions/*/assistant-approvals.json",
  "data/sessions/*/assistant-approvals.json",
];

export async function startTurnRequestFilesystem(input: {
  store: ObjectStore;
  prefix: string;
  root: string;
  turn: Pick<TurnRequest, "claim" | "conversationId" | "actingAs">;
  maxBytes?: number;
  deferredMaxBytes?: number;
  timings: Record<string, number>;
}) {
  const claimed = Boolean(input.turn.claim);
  let listing: ClaimedTurnListing | undefined;
  try {
    listing = claimed
      ? await listClaimedTurnStore({
          store: input.store,
          prefix: input.prefix,
          conversationId: input.turn.conversationId,
        })
      : undefined;
  } catch (error) {
    throw turnHydrationError(error);
  }
  return startTurnFilesystem({
    store: input.store,
    prefix: input.prefix,
    root: input.root,
    claimed,
    ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
    ...(claimed
      ? {
          filter: ownConversationOnly(
            input.turn.conversationId,
            input.turn.actingAs?.userId,
          ),
          excludes: [...CLAIMED_TURN_EXCLUDES],
          ...(listing ? { listing } : {}),
          defer: deferredWorkspaceFile,
          ...(input.deferredMaxBytes !== undefined
            ? { deferredMaxBytes: input.deferredMaxBytes }
            : {}),
          deferredReadTimeoutMs: DEFERRED_READ_TIMEOUT_MS,
          deferredParallel: DEFERRED_PARALLEL,
        }
      : { filter: ownClaudeFlagsOnly(input.turn.actingAs?.userId) }),
    timings: input.timings,
  });
}

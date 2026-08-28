import type { TurnServerDeps } from "./server-types";
import type { TurnFilesystem } from "./turn-filesystem";
import { makeTurnSandboxFetch } from "./turn-sandbox";
import type { poolIdentity, resolveTurnStore } from "./turn-store";
import type { TurnRequest } from "./types";

/** Build the grant-bound sandbox after identity validation. */
export function createTurnSandbox(input: {
  deps: TurnServerDeps;
  turn: TurnRequest;
  identity: ReturnType<typeof poolIdentity> | undefined;
  resolved: ReturnType<typeof resolveTurnStore>;
  filesystem: TurnFilesystem;
}): ReturnType<typeof makeTurnSandboxFetch> | null {
  const { turn, identity } = input;
  if (!turn.grant || !turn.hostToken || !identity) return null;
  return makeTurnSandboxFetch({
    grant: turn.grant,
    hostToken: turn.hostToken,
    store: input.resolved.store,
    prefix: input.resolved.prefix,
    filesystem: input.filesystem,
    workspaceId: turn.workspaceId,
    conversationId: turn.conversationId,
    ...(turn.actingAs ? { actingAs: turn.actingAs } : {}),
    orgSlug: identity.org,
    agentSlug: identity.agent,
    ...(input.deps.fetchImpl ? { fetchImpl: input.deps.fetchImpl } : {}),
  });
}

import { liveTurnPin } from "@houston/host/src/routes/live-turn-pin";
import type { TurnServerDeps } from "./server-types";
import { startTurnCoordinator } from "./turn-coordinator";
import type { TurnFilesystem } from "./turn-filesystem";
import { TurnSetupError } from "./turn-layout";
import { turnProvider } from "./turn-request";
import { makeTurnSandboxFetch } from "./turn-sandbox";
import type { poolIdentity, resolveTurnStore } from "./turn-store";
import type { TurnRequest } from "./types";

export function createTurnSandbox(input: {
  deps: TurnServerDeps;
  turn: TurnRequest;
  identity: ReturnType<typeof poolIdentity> | undefined;
  resolved: ReturnType<typeof resolveTurnStore>;
  filesystem: TurnFilesystem;
}): ReturnType<typeof makeTurnSandboxFetch> | null {
  const { turn, identity } = input;
  if (!turn.grant || !turn.hostToken || !identity) return null;
  if (turn.coordinator && input.filesystem.kind !== "standing")
    throw new TurnSetupError(
      "layout_unexpected",
      "Houston's turn needs its agent's own workspace tree",
    );
  const coordinator =
    turn.coordinator && turn.actingAs
      ? startTurnCoordinator({
          turn,
          ownerId: turn.actingAs.userId,
          token: turn.coordinator.token,
          gatewayUrl: turn.grant.url,
          agentSlug: identity.agent,
          store: input.resolved.store,
          prefix: input.resolved.prefix,
          filesystem: input.filesystem,
          ...(input.deps.fetchImpl ? { fetchImpl: input.deps.fetchImpl } : {}),
        })
      : undefined;
  return makeTurnSandboxFetch({
    grant: turn.grant,
    hostToken: turn.hostToken,
    store: input.resolved.store,
    prefix: input.resolved.prefix,
    filesystem: input.filesystem,
    workspaceId: turn.workspaceId,
    conversationId: turn.conversationId,
    timezone: turn.timezone,
    ...(turn.actingAs ? { actingAs: turn.actingAs } : {}),
    ...(turn.limits ? { limits: turn.limits } : {}),
    ...(turn.customOAuthCallbackUrl
      ? { customOAuthCallbackUrl: turn.customOAuthCallbackUrl }
      : {}),
    authoringPin: liveTurnPin({ ...turn, provider: turnProvider(turn) }),
    orgSlug: identity.org,
    agentSlug: identity.agent,
    ...(input.deps.fetchImpl ? { fetchImpl: input.deps.fetchImpl } : {}),
    ...(coordinator ? { coordinator } : {}),
  });
}

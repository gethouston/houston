/**
 * The per-agent engine-client cache the kernel hands every module through
 * {@link ModuleContext.clientFor}.
 *
 * Protocol v3 nests an agent's conversation, history, turn and settings routes
 * under `/agents/<id>`, so a client is rooted at ONE agent's sandbox; the empty
 * id roots at the base URL itself (the single-runtime local profile, where
 * those routes are flat). Clients are memoized per id and share the injected
 * `fetch`, which carries auth — so resolving one per operation is cheap and
 * every call rides the same session.
 */

import { HoustonEngineClient } from "@houston/runtime-client";
import type { SdkConfig } from "./ports";

export function createEngineClients(
  config: SdkConfig,
): (agentId: string) => HoustonEngineClient {
  const clients = new Map<string, HoustonEngineClient>();
  return (agentId) => {
    let client = clients.get(agentId);
    if (!client) {
      const baseUrl =
        agentId === ""
          ? config.baseUrl
          : `${config.baseUrl}/agents/${encodeURIComponent(agentId)}`;
      client = new HoustonEngineClient({ baseUrl, fetch: config.ports.fetch });
      clients.set(agentId, client);
    }
    return client;
  };
}

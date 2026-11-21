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

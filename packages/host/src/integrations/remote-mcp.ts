import type { McpIntegrationHost } from "./provider";
import type { ConnectionForwardTransport } from "./remote-custom";
import type { McpServerCreate, McpServerPatch } from "./types";

/**
 * Build the `McpIntegrationHost` create/update methods for a remote adapter,
 * mirroring `makeCustomForwarders`. Both are MODE 1 forwards (the user's own
 * session authenticates upstream, never acting-as): the gateway server-generates
 * the slug and seals the auth secret; we relay only the returned connection.
 * Update omits `authValue` unless supplied, so the stored secret is kept.
 */
export function makeMcpForwarders(
  transport: ConnectionForwardTransport,
): McpIntegrationHost {
  return {
    createMcpServer: (_userId: string, config: McpServerCreate) =>
      transport.postConnection("/create", config),
    updateMcpServer: (
      _userId: string,
      connectionId: string,
      patch: McpServerPatch,
    ) => transport.postConnection("/update", { connectionId, ...patch }),
  };
}

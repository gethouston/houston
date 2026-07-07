import type { CustomIntegrationHost } from "./provider";
import type {
  Connection,
  CustomIntegrationCreate,
  CustomIntegrationPatch,
} from "./types";

/**
 * The one upstream capability the create/update forwarders need: an
 * authenticated POST to a `/v1/integrations/<id>/*` sub-route that returns
 * `{ connection }`. The `RemoteIntegrationProvider` supplies it (bound to its
 * `call`/`must`); shared by the custom + MCP forwarders so the adapter file
 * stays within its size budget and there is one forward transport, not two.
 */
export interface ConnectionForwardTransport {
  postConnection(
    path: "/create" | "/update",
    body: unknown,
  ): Promise<Connection>;
}

/**
 * Build the `CustomIntegrationHost` create/update methods for a remote adapter.
 * Both are MODE 1 forwards (the user's own session authenticates upstream, never
 * acting-as): the gateway server-generates the slug and seals the key; we relay
 * only the returned connection. Update omits the apiKey to keep the stored key.
 */
export function makeCustomForwarders(
  transport: ConnectionForwardTransport,
): CustomIntegrationHost {
  return {
    createCustom: (_userId: string, config: CustomIntegrationCreate) =>
      transport.postConnection("/create", config),
    updateCustom: (
      _userId: string,
      connectionId: string,
      patch: CustomIntegrationPatch,
    ) => transport.postConnection("/update", { connectionId, ...patch }),
  };
}

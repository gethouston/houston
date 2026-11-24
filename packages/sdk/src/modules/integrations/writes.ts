import type { IntegrationProviderId } from "@houston/protocol";
import type { IntegrationsClient } from "@houston/runtime-client";

/** No-refetch integration writes for a host that owns its own reads. */
export interface IntegrationsWrites {
  /** Disconnect a toolkit for the user everywhere; no refetch. `opts.provider`
   *  defaults to composio (the only provider today). `opts.connectionId`
   *  narrows the removal to ONE account of the toolkit (a toolkit can hold
   *  several — two Gmail logins); omitted removes them all. */
  disconnect(
    toolkit: string,
    opts?: { provider?: IntegrationProviderId; connectionId?: string },
  ): Promise<void>;
}

export interface IntegrationsWriteOps {
  setSession(token: string | null): Promise<void>;
  dismissReconnectNotice(): Promise<void>;
  writes: IntegrationsWrites;
}

export function createIntegrationsWrites(
  client: IntegrationsClient,
  run: <T>(fn: () => Promise<T>) => Promise<T>,
): IntegrationsWriteOps {
  return {
    /**
     * Hands the gateway the caller's session token so it can act for the user.
     * @assistant group:integrations
     * @assistant hidden: UI plumbing; the app pushes its own session token on sign-in and clears it on sign-out.
     * @assistant hands: unreachable the app renews its own sign-in, so there is nothing here for the person to finish.
     */
    setSession: (token) => run(() => client.setSession(token)),
    /**
     * Dismisses the one-time notice asking the user to reconnect their apps.
     * @assistant group:integrations
     * @assistant hidden: UI plumbing; the notice is dismissed by the person who is looking at it.
     * @assistant hands: unreachable the notice lives on the screen the person is already looking at, so there is no errand to hand over.
     */
    dismissReconnectNotice: () => run(() => client.dismissReconnectNotice()),
    writes: {
      /**
       * Disconnects an outside app without refetching the connection list.
       * @assistant group:integrations
       * @assistant hidden: the variant for a surface that owns its own reads; integrations.disconnect is the one to dispatch, and it also refreshes what the user sees.
       * @assistant hands: unreachable the same change is integrations.disconnect, which the assistant makes itself.
       */
      disconnect: (toolkit, opts) =>
        run(() => client.disconnect(toolkit, opts)),
    },
  };
}

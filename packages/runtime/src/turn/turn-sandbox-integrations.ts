import type {
  ActingContext,
  ProviderSearchResult,
} from "@houston/host/src/integrations/provider";
import { IntegrationRegistry } from "@houston/host/src/integrations/registry";
import { RemoteIntegrationProvider } from "@houston/host/src/integrations/remote";
import {
  type ActionResult,
  IntegrationSigninRequiredError,
} from "@houston/host/src/integrations/types";
import {
  executeIntegration,
  searchIntegrations,
} from "@houston/host/src/routes/integrations-fanout";
import type { TurnCustomContext } from "./turn-custom-context";
import type { TurnSandboxDeps } from "./turn-sandbox";
import { fetchWithTurnSignal } from "./turn-sandbox-signal";

/** The gateway no longer accepts this turn's short-lived authority. */
export class TurnGrantExpiredError extends Error {}

class GrantRemoteProvider extends RemoteIntegrationProvider {
  override async search(
    userId: string,
    query: string,
    acting?: ActingContext,
    app?: string,
  ): Promise<ProviderSearchResult> {
    try {
      return await super.search(userId, query, acting, app);
    } catch (error) {
      if (error instanceof IntegrationSigninRequiredError) {
        throw new TurnGrantExpiredError();
      }
      throw error;
    }
  }

  override async execute(
    userId: string,
    action: string,
    params: Record<string, unknown>,
    acting?: ActingContext,
    account?: string,
  ): Promise<ActionResult> {
    try {
      return await super.execute(userId, action, params, acting, account);
    } catch (error) {
      if (error instanceof IntegrationSigninRequiredError) {
        throw new TurnGrantExpiredError();
      }
      throw error;
    }
  }
}

/** Build the Composio/custom integration routes used by the turn facade. */
export function makeTurnIntegrationRoutes(
  deps: TurnSandboxDeps,
  fetchImpl: typeof fetch,
  getCustom: (signal?: AbortSignal | null) => Promise<TurnCustomContext>,
) {
  return async (
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal | null,
  ) => {
    const gateway = new GrantRemoteProvider({
      id: "composio",
      upstreamUrl: deps.grant.url,
      token: () => null,
      fetch: fetchWithTurnSignal(fetchImpl, signal),
    });
    try {
      if (path.endsWith("/search")) {
        if (typeof body.query !== "string") {
          return Response.json({ error: "missing 'query'" }, { status: 400 });
        }
        const registry = new IntegrationRegistry([
          gateway,
          (await getCustom(signal)).provider,
        ]);
        const app = typeof body.app === "string" ? body.app.trim() : "";
        return Response.json(
          await searchIntegrations({
            registry,
            userId: deps.workspaceId,
            query: body.query,
            acting: { actingAs: deps.grant.token },
            ...(app ? { app } : {}),
            fatalFailure: (error) =>
              error instanceof TurnGrantExpiredError ||
              signal?.aborted === true,
          }),
        );
      }
      if (typeof body.action !== "string") {
        return Response.json({ error: "missing 'action'" }, { status: 400 });
      }
      const registry = new IntegrationRegistry([
        gateway,
        (await getCustom(signal)).provider,
      ]);
      const params =
        body.params && typeof body.params === "object"
          ? (body.params as Record<string, unknown>)
          : {};
      const account = typeof body.account === "string" ? body.account : "";
      return Response.json(
        await executeIntegration({
          registry,
          userId: deps.workspaceId,
          action: body.action,
          params,
          acting: { actingAs: deps.grant.token },
          ...(account ? { account } : {}),
        }),
      );
    } catch (error) {
      if (
        error instanceof TurnGrantExpiredError &&
        deps.grant.expires > Date.now() / 1000 + 60
      ) {
        console.error(
          "[turn-sandbox] integrations gateway rejected a grant before its advertised expiry; check gateway grant verification",
        );
      }
      throw error;
    }
  };
}

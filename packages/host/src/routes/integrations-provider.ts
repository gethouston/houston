import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { IntegrationProvider } from "../integrations/provider";
import type { IntegrationRegistry } from "../integrations/registry";
import { IntegrationSigninRequiredError } from "../integrations/types";
import { json, optionalTrimmed, readJson } from "./http";
import { relayIntegrationUpstreamError, signinRequired } from "./integrations";

/**
 * The per-provider half of the user integrations surface:
 * `/v1/integrations/:provider/*` — the toolkit catalog, the user's
 * connections, connect (a real OAuth redirect), a connection poll, disconnect,
 * plus search/execute for the desktop gateway.
 */

/** Resolve the provider from the URL segment, or 404. */
function providerOr404(
  registry: IntegrationRegistry,
  id: string | undefined,
  res: ServerResponse,
): IntegrationProvider | null {
  if (id && registry.has(id)) return registry.get(id);
  json(res, 404, { error: `unknown integration provider '${id ?? ""}'` });
  return null;
}

/** Answer one `/v1/integrations/:provider/<sub>` request. Always answers: a
 *  sub this family does not know is a 404 from here, not a fall-through. */
export async function handleProviderRequest(
  registry: IntegrationRegistry,
  userId: UserId,
  providerId: string | undefined,
  sub: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const provider = providerOr404(registry, providerId, res);
  if (!provider) return;

  try {
    if (sub === "toolkits" && method === "GET") {
      json(res, 200, { items: await provider.listToolkits() });
      return;
    }
    if (sub === "connections" && method === "GET") {
      json(res, 200, { items: await provider.listConnections(userId) });
      return;
    }
    const connPoll = sub.match(/^connections\/([^/]+)$/)?.[1];
    if (connPoll && method === "GET") {
      const conn = await provider.connection(userId, connPoll);
      if (!conn) json(res, 404, { error: "connection not found" });
      else json(res, 200, conn);
      return;
    }
    if (sub === "connect" && method === "POST") {
      const { toolkit } = await readJson(req);
      if (!toolkit || typeof toolkit !== "string") {
        json(res, 400, { error: "missing 'toolkit'" });
        return;
      }
      json(res, 200, await provider.connect(userId, toolkit));
      return;
    }
    if (sub === "disconnect" && method === "POST") {
      const { toolkit, connectionId } = await readJson(req);
      if (!toolkit || typeof toolkit !== "string") {
        json(res, 400, { error: "missing 'toolkit'" });
        return;
      }
      // Optional `connectionId` narrows the removal to ONE account of the
      // toolkit (a toolkit can hold several — two Gmail logins); absent, every
      // account for the toolkit goes.
      await provider.disconnect(
        userId,
        toolkit,
        typeof connectionId === "string" && connectionId
          ? connectionId
          : undefined,
      );
      json(res, 200, { ok: true });
      return;
    }
    if (sub === "search" && method === "POST") {
      const { query, app } = await readJson(req);
      if (typeof query !== "string") {
        json(res, 400, { error: "missing 'query'" });
        return;
      }
      // Optional `app` hard-scopes discovery to one named app (PRODUCT-1274);
      // the desktop gateway adapter forwards it here verbatim. STRICTLY
      // scoped — no unscoped fallback here: the sandbox proxy at the top of
      // the chain owns that retry, so a scoped call through this route never
      // smuggles other apps' actions into a caller's merge. The `scoped` echo
      // tells a downstream remote adapter what became of the scope (absent =
      // the provider ignored it, which the adapter must surface, not trust).
      const result = await provider.search(
        userId,
        query,
        undefined,
        optionalTrimmed(app),
      );
      json(res, 200, {
        items: result.items,
        ...(result.scope === "resolved" ? { scoped: true } : {}),
        ...(result.scope === "unresolved" ? { scoped: false } : {}),
      });
      return;
    }
    if (sub === "execute" && method === "POST") {
      const body = await readJson(req);
      if (typeof body.action !== "string") {
        json(res, 400, { error: "missing 'action'" });
        return;
      }
      const params =
        body.params && typeof body.params === "object"
          ? (body.params as Record<string, unknown>)
          : {};
      // Optional `account` targets one of the user's connected accounts for
      // the action's toolkit (see IntegrationProvider.execute).
      const account =
        typeof body.account === "string" && body.account
          ? body.account
          : undefined;
      json(
        res,
        200,
        await provider.execute(userId, body.action, params, undefined, account),
      );
      return;
    }
  } catch (err) {
    if (err instanceof IntegrationSigninRequiredError) {
      signinRequired(res);
      return;
    }
    if (relayIntegrationUpstreamError(res, err)) return;
    throw err;
  }

  json(res, 404, { error: "not found" });
}

import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { IntegrationProvider } from "../integrations/provider";
import type { IntegrationRegistry } from "../integrations/registry";
import { IntegrationSigninRequiredError } from "../integrations/types";
import { json, optionalTrimmed, readJson } from "./http";
import { relayIntegrationUpstreamError, signinRequired } from "./integrations";

function providerOr404(
  registry: IntegrationRegistry,
  id: string | undefined,
  res: ServerResponse,
): IntegrationProvider | null {
  if (id && registry.has(id)) return registry.get(id);
  json(res, 404, { error: `unknown integration provider '${id ?? ""}'` });
  return null;
}

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

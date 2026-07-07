import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { IntegrationProvider } from "../integrations/provider";
import { json, readJson } from "./http";

/**
 * The per-provider USER sub-routes under `/v1/integrations/:id/*` (toolkit
 * catalog, connections, connect/poll, per-account disconnect + rename,
 * search/execute passthrough). Split out of integrations.ts to keep each file
 * within the size budget; the caller owns provider resolution and the shared
 * signin/upstream error mapping. Returns true once a branch handled the request
 * (a response was written), false when `sub` matched no route (caller 404s).
 */
export async function handleProviderSubRoute(
  provider: IntegrationProvider,
  userId: UserId,
  sub: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (sub === "toolkits" && method === "GET") {
    json(res, 200, { items: await provider.listToolkits() });
    return true;
  }
  if (sub === "connections" && method === "GET") {
    json(res, 200, { items: await provider.listConnections(userId) });
    return true;
  }
  const connPoll = sub.match(/^connections\/([^/]+)$/)?.[1];
  if (connPoll && method === "GET") {
    const conn = await provider.connection(userId, connPoll);
    if (!conn) json(res, 404, { error: "connection not found" });
    else json(res, 200, conn);
    return true;
  }
  if (sub === "connect" && method === "POST") {
    const { toolkit } = await readJson(req);
    if (!toolkit || typeof toolkit !== "string") {
      json(res, 400, { error: "missing 'toolkit'" });
      return true;
    }
    json(res, 200, await provider.connect(userId, toolkit));
    return true;
  }
  if (sub === "disconnect" && method === "POST") {
    const { connectionId } = await readJson(req);
    if (!connectionId || typeof connectionId !== "string") {
      json(res, 400, { error: "missing 'connectionId'" });
      return true;
    }
    await provider.disconnect(userId, connectionId);
    json(res, 200, { ok: true });
    return true;
  }
  // POST /connections/:connectionId/rename — set the account's user-facing alias
  // (1..64 chars after trimming). Per-account; ownership enforced by the adapter.
  const renameId = sub.match(/^connections\/([^/]+)\/rename$/)?.[1];
  if (renameId && method === "POST") {
    const { alias } = await readJson(req);
    const trimmed = typeof alias === "string" ? alias.trim() : "";
    if (trimmed.length < 1 || trimmed.length > 64) {
      json(res, 400, { error: "alias must be 1..64 characters" });
      return true;
    }
    await provider.rename(userId, decodeURIComponent(renameId), trimmed);
    json(res, 200, { ok: true });
    return true;
  }
  if (sub === "search" && method === "POST") {
    const { query } = await readJson(req);
    if (typeof query !== "string") {
      json(res, 400, { error: "missing 'query'" });
      return true;
    }
    // SearchResult passthrough ({ items, accounts? }); enforcement (and the
    // granted-accounts attachment) happens on the sandbox proxy, not here.
    json(res, 200, await provider.search(userId, query));
    return true;
  }
  if (sub === "execute" && method === "POST") {
    const body = await readJson(req);
    if (typeof body.action !== "string") {
      json(res, 400, { error: "missing 'action'" });
      return true;
    }
    const params =
      body.params && typeof body.params === "object"
        ? (body.params as Record<string, unknown>)
        : {};
    // User-facing (the desktop gateway forwards here): pass `account` through
    // verbatim, no grant enforcement — that lives on the sandbox proxy.
    const account =
      typeof body.account === "string" && body.account.length > 0
        ? body.account
        : undefined;
    json(
      res,
      200,
      await provider.execute(userId, body.action, params, {
        account,
      }),
    );
    return true;
  }
  return false;
}

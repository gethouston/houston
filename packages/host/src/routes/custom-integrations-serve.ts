import type { IncomingMessage, ServerResponse } from "node:http";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import {
  bodyOr400,
  type CustomTarget,
  parseAddInput,
  relayCustomError,
} from "./custom-integrations";
import { json } from "./http";

/**
 * The surface-agnostic core of the custom-integration USER routes: serve one
 * request against the manager. The three mounts in custom-integrations-user.ts
 * (top-level, agent-scoped, per-agent dispatch) all land here, so the answer a
 * client gets cannot depend on which one it called.
 *
 * Returns false when method + target name no route in this family — the caller
 * declines and the chain walks on, which is how `custom/connections` still
 * reaches the generic provider family behind it.
 */
export async function serveCustomTarget(
  manager: CustomIntegrationManager,
  method: string,
  target: CustomTarget,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  try {
    if (target.kind === "definitions" && method === "GET") {
      json(res, 200, { items: await manager.list() });
      return true;
    }
    // The manual add form (HOU-980). Same body grammar as the agent's
    // sandbox add tool — parseAddInput is the one validator for both.
    if (target.kind === "definitions" && method === "POST") {
      const body = await bodyOr400(req, res);
      if (!body) return true;
      const input = parseAddInput(body);
      if (typeof input === "string") {
        json(res, 400, { error: input });
        return true;
      }
      json(res, 200, await manager.add(input));
      return true;
    }
    if (target.kind === "detect" && method === "POST") {
      const body = await bodyOr400(req, res);
      if (!body) return true;
      if (typeof body.url !== "string" || !body.url.trim()) {
        json(res, 400, { error: "missing 'url'" });
        return true;
      }
      json(res, 200, await manager.detect(body.url.trim()));
      return true;
    }
    if (target.kind === "definition" && method === "PATCH") {
      const body = await bodyOr400(req, res);
      if (!body) return true;
      await manager.updateDetails(target.slug, body);
      json(res, 200, { ok: true });
      return true;
    }
    if (target.kind === "definition" && method === "DELETE") {
      await manager.remove(target.slug);
      json(res, 200, { ok: true });
      return true;
    }
    if (target.kind === "tools" && method === "GET") {
      json(res, 200, { items: await manager.tools(target.slug) });
      return true;
    }
    // OAuth sign-in start (PRODUCT-1172): mint the authorize URL the client
    // opens in the browser; the redirect lands on the PUBLIC callback route
    // (custom-integrations-oauth.ts), which completes the flow server-side.
    if (target.kind === "oauthStart" && method === "POST") {
      json(res, 200, await manager.startOAuth(target.slug));
      return true;
    }
    if (target.kind === "credential" && method === "POST") {
      const body = await bodyOr400(req, res);
      if (!body) return true;
      const values = body.values;
      if (
        !values ||
        typeof values !== "object" ||
        Array.isArray(values) ||
        !Object.values(values).every((v) => typeof v === "string")
      ) {
        json(res, 400, { error: "missing 'values' (object of strings)" });
        return true;
      }
      json(
        res,
        200,
        await manager.setCredential(
          target.slug,
          values as Record<string, string>,
        ),
      );
      return true;
    }
  } catch (err) {
    if (relayCustomError(res, err)) return true;
    throw err;
  }
  return false;
}

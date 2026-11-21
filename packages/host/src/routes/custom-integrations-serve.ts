import type { IncomingMessage, ServerResponse } from "node:http";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import {
  bodyOr400,
  type CustomTarget,
  relayCustomError,
} from "./custom-integrations";
import { parseAddInput } from "./custom-integrations-input";
import { json } from "./http";

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

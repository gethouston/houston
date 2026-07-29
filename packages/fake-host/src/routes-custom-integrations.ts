/**
 * Custom integrations (HOU-550 / HOU-980): `/v1/integrations/custom/*` and the
 * per-agent forms routed here by routes-integrations.ts. The list 404s when the
 * feature is not armed — exactly how an older real host answers, which the
 * client reads as "hide every custom surface" (null).
 */

import { json } from "./http";
import * as state from "./state";

export function handleCustom(
  method: string,
  tail: string[],
  body: Record<string, unknown> | undefined,
): Response {
  const items = state.listCustomIntegrations();
  if (items === null || (tail[0] !== "definitions" && tail[0] !== "detect")) {
    return json({ error: "not found" }, 404);
  }
  // POST /v1/integrations/custom/detect { url } (HOU-980)
  if (tail.length === 1 && tail[0] === "detect" && method === "POST") {
    const url = String(body?.url ?? "").trim();
    if (!url) return json({ error: "missing 'url'" }, 400);
    return json(state.detectCustomIntegration(url));
  }
  if (tail[0] === "detect") return json({ error: "not found" }, 404);
  // GET /v1/integrations/custom/definitions
  if (tail.length === 1 && method === "GET") return json({ items });
  // POST /v1/integrations/custom/definitions — the manual add form (HOU-980)
  if (tail.length === 1 && method === "POST") {
    const name = String(body?.name ?? "").trim();
    const kind = body?.kind;
    if (!name || (kind !== "openapi" && kind !== "mcp")) {
      return json({ error: "invalid add body" }, 400);
    }
    const seed = state.addCustomIntegration({
      kind,
      name,
      auth: body?.auth === "credential" ? "credential" : "none",
      ...(typeof body?.url === "string" ? { url: body.url } : {}),
      ...(typeof body?.endpoint === "string"
        ? { endpoint: body.endpoint }
        : {}),
      ...(typeof body?.slug === "string" ? { slug: body.slug } : {}),
    });
    return seed
      ? json(seed)
      : json(
          {
            error: `a custom integration named '${name}' already exists`,
            code: "duplicate_slug",
          },
          409,
        );
  }
  // DELETE /v1/integrations/custom/definitions/:slug
  if (tail.length === 2 && method === "DELETE") {
    return state.removeCustomIntegration(tail[1] ?? "")
      ? json({ ok: true })
      : json({ error: "not found", code: "not_found" }, 404);
  }
  // GET /v1/integrations/custom/definitions/:slug/tools (HOU-980)
  if (tail.length === 3 && tail[2] === "tools" && method === "GET") {
    const tools = state.listCustomTools(tail[1] ?? "");
    return tools
      ? json({ items: tools })
      : json({ error: "not found", code: "not_found" }, 404);
  }
  // POST /v1/integrations/custom/definitions/:slug/credential
  if (tail.length === 3 && tail[2] === "credential" && method === "POST") {
    const view = state.setCustomCredential(tail[1] ?? "");
    return view
      ? json(view)
      : json({ error: "not found", code: "not_found" }, 404);
  }
  return json({ error: "not found" }, 404);
}

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
  // POST /v1/integrations/custom/definitions — the manual add form (HOU-980).
  // Mirrors the real host's parseAddInput requirements so a client that stops
  // sending a required field fails HERE too, not only in production: openapi
  // needs `url` OR an inline `spec`, mcp needs `endpoint`, and a provided
  // slug must satisfy the real CUSTOM_SLUG grammar.
  if (tail.length === 1 && method === "POST") {
    const name = String(body?.name ?? "").trim();
    const kind = body?.kind;
    if (!name || (kind !== "openapi" && kind !== "mcp")) {
      return json({ error: "invalid add body" }, 400);
    }
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const spec = typeof body?.spec === "string" ? body.spec.trim() : "";
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    if (kind === "openapi" && !url && !spec) {
      return json({ error: "missing 'url' or 'spec'" }, 400);
    }
    if (kind === "mcp" && !endpoint) {
      return json({ error: "missing 'endpoint'" }, 400);
    }
    const slug = typeof body?.slug === "string" ? body.slug : undefined;
    if (slug && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) {
      return json(
        { error: `invalid slug '${slug}'`, code: "invalid_slug" },
        400,
      );
    }
    const seed = state.addCustomIntegration({
      kind,
      name,
      auth:
        body?.auth === "credential"
          ? "credential"
          : body?.auth === "oauth" && kind === "mcp"
            ? "oauth"
            : "none",
      ...(url ? { url } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...(slug ? { slug } : {}),
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
  // POST /v1/integrations/custom/definitions/:slug/oauth/start (PRODUCT-1172):
  // hand back an authorize URL and flip the seed to active as if the user
  // finished the browser dance immediately — enough for the UI flow to be
  // exercised end-to-end without a real authorization server.
  if (
    tail.length === 4 &&
    tail[2] === "oauth" &&
    tail[3] === "start" &&
    method === "POST"
  ) {
    const view = state.setCustomCredential(tail[1] ?? "");
    return view
      ? json({ authorizeUrl: "https://auth.fake.example/authorize?state=fake" })
      : json({ error: "not found", code: "not_found" }, 404);
  }
  return json({ error: "not found" }, 404);
}

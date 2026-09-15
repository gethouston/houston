import type { AddCustomIntegrationInput } from "../integrations/custom/manager";

/** Validate the discriminated add-input (400 on shape errors — the agent tool
 *  relays the message so the model can correct itself; the manual-add form
 *  never produces one because it builds the body from typed fields). Shared
 *  with the USER add route in custom-integrations-user.ts, so both surfaces
 *  accept the exact same body. */
/** Static request headers for an MCP definition: a small map of plain
 *  header names to short values. Never a credential — `Authorization` (and
 *  any cookie) is refused here so a secret can only travel through the
 *  credential save, where it lands in the vault instead of the def file. */
function parseStaticHeaders(raw: unknown): Record<string, string> | string {
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return "'headers' must be an object of header names to values";
  }
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name)) {
      return `'headers' has an invalid header name '${name}'`;
    }
    if (
      ["authorization", "cookie", "proxy-authorization"].includes(
        name.toLowerCase(),
      )
    ) {
      return `'headers' must not carry '${name}' - save secrets as the credential instead`;
    }
    if (typeof value !== "string" || !value.trim() || value.length > 256) {
      return `'headers' value for '${name}' must be a short non-empty string`;
    }
    headers[name] = value.trim();
  }
  if (Object.keys(headers).length > 8)
    return "'headers' lists too many headers";
  return headers;
}

export function parseAddInput(
  body: Record<string, unknown>,
): AddCustomIntegrationInput | string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return "missing 'name'";
  if (body.auth === "oauth" && body.kind !== "mcp") {
    return "auth 'oauth' is only supported for MCP servers";
  }
  const auth =
    body.auth === "credential"
      ? ("credential" as const)
      : body.auth === "oauth"
        ? ("oauth" as const)
        : ("none" as const);
  const slug = typeof body.slug === "string" ? body.slug : undefined;
  // The brand website for the card's icon (cosmetic; non-http values are
  // simply dropped — icon derivation guards again anyway).
  const website =
    typeof body.website === "string" &&
    /^https?:\/\//i.test(body.website.trim())
      ? body.website.trim()
      : undefined;
  if (body.kind === "openapi") {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    // An inline document (agent-authored from the service's API docs when no
    // published OpenAPI URL exists) — no network fetch, ever again.
    const inline = typeof body.spec === "string" ? body.spec.trim() : "";
    if (!url && !inline)
      return "missing 'url' (the OpenAPI document URL) or 'spec' (an inline OpenAPI document)";
    return {
      kind: "openapi",
      name,
      spec: inline ? { kind: "blob", value: inline } : { kind: "url", url },
      ...(typeof body.baseUrl === "string" ? { baseUrl: body.baseUrl } : {}),
      ...(website ? { website } : {}),
      auth,
      ...(slug ? { slug } : {}),
      ...(body.replace === true ? { replace: true } : {}),
    };
  }
  if (body.kind === "mcp") {
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    if (!endpoint) return "missing 'endpoint' (the MCP server URL)";
    const headers = parseStaticHeaders(body.headers);
    if (typeof headers === "string") return headers;
    return {
      kind: "mcp",
      name,
      endpoint,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(website ? { website } : {}),
      auth,
      ...(slug ? { slug } : {}),
      ...(body.replace === true ? { replace: true } : {}),
    };
  }
  return "unknown 'kind' (expected 'openapi' or 'mcp')";
}

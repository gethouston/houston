import { load as loadYaml } from "js-yaml";
import type { CustomIntegrationDef } from "./types";

/**
 * The credential-carry guard for `add(replace:true)` (HOU-1083 review):
 * a replacement may keep the stored API key ONLY when the service it talks to
 * is provably unchanged. Without this, a prompt-injected agent could swap in a
 * spec whose `servers[].url` points at an attacker host and the next action
 * would deliver the user's key there. Anything indeterminate (unparseable
 * spec, relative servers, mixed source kinds) reads as CHANGED — the
 * replacement then lands `pending` and the key is re-collected through the
 * secure card, never through the chat.
 */

const httpOrigin = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

/** `servers[].url` origins of an OpenAPI document, or null when any entry is
 *  relative/non-http or the document does not parse (JSON first, then YAML). */
export function specServerOrigins(value: string): Set<string> | null {
  let doc: unknown;
  try {
    doc = JSON.parse(value);
  } catch {
    try {
      doc = loadYaml(value);
    } catch {
      return null;
    }
  }
  if (typeof doc !== "object" || doc === null) return null;
  const servers = (doc as { servers?: unknown }).servers;
  if (!Array.isArray(servers) || servers.length === 0) return null;
  const origins = new Set<string>();
  for (const server of servers) {
    const url = (server as { url?: unknown })?.url;
    if (typeof url !== "string") return null;
    const origin = httpOrigin(url);
    if (!origin) return null;
    origins.add(origin);
  }
  return origins;
}

/** The origins a definition's actions can reach, or null when indeterminate.
 *  A `baseUrl` override wins over the spec's own servers (that is what the
 *  executor sends requests to). */
function originsOf(def: CustomIntegrationDef): Set<string> | null {
  if (def.kind === "mcp") {
    const origin = httpOrigin(def.endpoint);
    return origin ? new Set([origin]) : null;
  }
  if (def.baseUrl) {
    const origin = httpOrigin(def.baseUrl);
    return origin ? new Set([origin]) : null;
  }
  if (def.spec.kind === "blob") return specServerOrigins(def.spec.value);
  // A url-sourced spec's servers live in the remote document; equality is
  // decided by the document identity instead (see sameServiceOrigins).
  return null;
}

/** True only when the replacement PROVABLY talks to the same service. */
export function sameServiceOrigins(
  previous: CustomIntegrationDef,
  next: CustomIntegrationDef,
): boolean {
  if (previous.kind !== next.kind) return false;
  if (
    previous.kind === "openapi" &&
    next.kind === "openapi" &&
    !previous.baseUrl &&
    !next.baseUrl &&
    previous.spec.kind === "url" &&
    next.spec.kind === "url"
  ) {
    // Same remote document = same servers, whatever they are.
    return previous.spec.url === next.spec.url;
  }
  const before = originsOf(previous);
  const after = originsOf(next);
  if (!before || !after) return false;
  if (before.size !== after.size) return false;
  for (const origin of after) if (!before.has(origin)) return false;
  return true;
}

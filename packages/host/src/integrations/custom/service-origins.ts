import { load as loadYaml } from "js-yaml";
import type { CustomIntegrationDef } from "./types";

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
  return null;
}

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
    return previous.spec.url === next.spec.url;
  }
  const before = originsOf(previous);
  const after = originsOf(next);
  if (!before || !after) return false;
  if (before.size !== after.size) return false;
  for (const origin of after) if (!before.has(origin)) return false;
  return true;
}

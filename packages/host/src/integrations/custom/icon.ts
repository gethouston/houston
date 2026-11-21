import { specServerOrigins } from "./service-origins";
import type { CustomIntegrationDef } from "./types";

const hostOf = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.hostname
      : null;
  } catch {
    return null;
  }
};

const SERVICE_PREFIXES = new Set(["www", "api", "mcp"]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

const PRIVATE_SUFFIXES = new Set([
  "local",
  "localhost",
  "internal",
  "intranet",
  "corp",
  "lan",
  "home",
  "test",
  "invalid",
]);

export function faviconDomain(host: string): string | null {
  if (IPV4.test(host) || host.includes(":")) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  const last = labels[labels.length - 1];
  if (!last || PRIVATE_SUFFIXES.has(last)) return null;
  const [first, ...rest] = labels;
  if (labels.length > 2 && first && SERVICE_PREFIXES.has(first))
    return rest.join(".");
  return host;
}

function serviceHost(def: CustomIntegrationDef): string | null {
  if (def.website) return hostOf(def.website);
  if (def.kind === "mcp") return hostOf(def.endpoint);
  if (def.baseUrl) return hostOf(def.baseUrl);
  if (def.spec.kind === "url") return hostOf(def.spec.url);
  const origins = specServerOrigins(def.spec.value);
  const first = origins?.values().next().value;
  return first ? hostOf(first) : null;
}

export function iconUrlOf(def: CustomIntegrationDef): string | undefined {
  const host = serviceHost(def);
  const domain = host ? faviconDomain(host) : null;
  if (!domain) return undefined;
  if (def.website) return `https://${host}/favicon.ico`;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

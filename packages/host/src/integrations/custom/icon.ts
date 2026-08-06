import { specServerOrigins } from "./service-origins";
import type { CustomIntegrationDef } from "./types";

/**
 * Derive a recognizable icon URL for a custom integration from the service it
 * talks to (PRODUCT-1172). Derived at view-build time, never persisted: a
 * spec/endpoint replacement re-derives it for free, and there is no stored
 * field to migrate. The favicon service is the same one the Composio catalog
 * fallback already uses (`app-display.ts` `fallbackLogo`); the client's
 * `AppLogo` letter avatar remains the fallback when the image fails to load.
 */

/** Hostname of an http(s) URL, or null (non-http schemes carry no favicon). */
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

/** Purely technical prefixes whose parent domain owns the brand: the favicon
 *  for `mcp.linear.app` lives on `linear.app`. One label only — anything
 *  deeper is a guess we don't make. */
const SERVICE_PREFIXES = new Set(["www", "api", "mcp"]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Suffixes that mark a PRIVATE network name: the lookup URL would disclose
 *  an internal hostname to the favicon service for a globe icon in return. */
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

/** The domain whose favicon stands for the service, or null when no public
 *  favicon can exist (IP addresses, single-label hosts like `localhost`,
 *  private-suffix names like `mcp.payroll.corp`). */
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

/** Where the definition's service lives: the MCP endpoint, the API base URL,
 *  the spec URL, or a blob spec's first `servers[]` origin. */
function serviceHost(def: CustomIntegrationDef): string | null {
  if (def.kind === "mcp") return hostOf(def.endpoint);
  if (def.baseUrl) return hostOf(def.baseUrl);
  if (def.spec.kind === "url") return hostOf(def.spec.url);
  const origins = specServerOrigins(def.spec.value);
  const first = origins?.values().next().value;
  return first ? hostOf(first) : null;
}

/** The icon URL the view carries, or undefined (the UI shows its letter
 *  avatar). */
export function iconUrlOf(def: CustomIntegrationDef): string | undefined {
  const host = serviceHost(def);
  const domain = host ? faviconDomain(host) : null;
  if (!domain) return undefined;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

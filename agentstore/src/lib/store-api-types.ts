/**
 * Site-local helpers for the Houston Agent Store frontend: gateway base-URL
 * resolution (server vs client env), the AgentIR schema link, and the icon
 * adapter the `AgentIcon` component renders. The wire types, the `StoreApiError`
 * class, and the HTTP client itself live in `@houston/agentstore-client`; this
 * module carries only what is specific to this Next.js deployment.
 *
 * Client-safe (no `server-only`, no Node built-ins) so both server and client
 * components can read the base helpers and the icon adapter.
 */
import { STORE_API_PREFIX, type StoreIcon } from "@houston/agentstore-client";
import type { AgentIdentity } from "@houston/agentstore-contract";

/** Default gateway origin when no env override is set. */
const DEFAULT_GATEWAY_URL = "https://gateway.gethouston.ai";

/** Trim a base URL of trailing slashes so `${base}${STORE_API_PREFIX}` is clean. */
function trimBase(raw: string | undefined): string {
  return (raw?.trim() || DEFAULT_GATEWAY_URL).replace(/\/+$/, "");
}

/**
 * Server-side gateway base (`AGENTSTORE_GATEWAY_URL`). Read lazily per call so a
 * `next build` with no env still succeeds; the value is only needed at request
 * time. NEVER exposed to the browser.
 */
export function serverGatewayBase(): string {
  return trimBase(process.env.AGENTSTORE_GATEWAY_URL);
}

/**
 * Client-side gateway base (`NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL`), inlined at
 * build time so client components can call the gateway directly with a bearer.
 */
export function clientGatewayBase(): string {
  return trimBase(process.env.NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL);
}

/**
 * Public URL of the AgentIR JSON Schema, served by the gateway
 * (`GET /v1/agentstore/schema/agent`). Used for the "publish over the API" links,
 * which point browsers straight at the gateway's embedded schema.
 */
export function agentSchemaUrl(): string {
  return `${clientGatewayBase()}${STORE_API_PREFIX}/schema/agent`;
}

/**
 * Adapt the gateway's `{kind,value}|null` icon to the IR icon union that the
 * `AgentIcon` component renders (`{kind:"emoji",value}|{kind:"url",url}`).
 */
export function toDisplayIcon(icon: StoreIcon | null): AgentIdentity["icon"] {
  if (!icon) return undefined;
  if (icon.kind === "url") return { kind: "url", url: icon.value };
  return { kind: "emoji", value: icon.value };
}

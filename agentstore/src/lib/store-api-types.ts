import { STORE_API_PREFIX, type StoreIcon } from "@houston/agentstore-client";
import type { AgentIdentity } from "@houston/agentstore-contract";

const DEFAULT_GATEWAY_URL = "https://gateway.gethouston.ai";

function trimBase(raw: string | undefined): string {
  return (raw?.trim() || DEFAULT_GATEWAY_URL).replace(/\/+$/, "");
}

export function serverGatewayBase(): string {
  return trimBase(process.env.AGENTSTORE_GATEWAY_URL);
}

export function clientGatewayBase(): string {
  return trimBase(process.env.NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL);
}

export function agentSchemaUrl(): string {
  return `${clientGatewayBase()}${STORE_API_PREFIX}/schema/agent`;
}

export function toDisplayIcon(icon: StoreIcon | null): AgentIdentity["icon"] {
  if (!icon) return undefined;
  if (icon.kind === "url") return { kind: "url", url: icon.value };
  return { kind: "emoji", value: icon.value };
}

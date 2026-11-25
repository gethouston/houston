import { coordinatorScope } from "../assistant/coordinator-scope";
import type { AssistantGateway } from "./assistant-forward";

export const ASSISTANT_CP_URL_ENV = "HOUSTON_ASSISTANT_CP_URL";
export const ASSISTANT_TOKEN_ENV = "HOUSTON_ASSISTANT_TOKEN";

export interface AssistantWiring {
  env?: NodeJS.ProcessEnv;
  self?: AssistantGateway;
  gatewayFronted?: boolean;
}

const normalize = (gateway: AssistantGateway): AssistantGateway => ({
  url: gateway.url.replace(/\/+$/, ""),
  token: gateway.token,
});

function envAssistantGateway(env: NodeJS.ProcessEnv): AssistantGateway | null {
  const url = env[ASSISTANT_CP_URL_ENV]?.trim();
  const token = env[ASSISTANT_TOKEN_ENV]?.trim();
  return url && token ? normalize({ url, token }) : null;
}

// WHY: fetch re-sends custom headers across redirects, so loopback calls use manual redirects. ADR-0016
export function resolveAssistantGateway(
  wiring: AssistantWiring = {},
): AssistantGateway | null {
  const scoped = coordinatorScope();
  if (scoped) return normalize(scoped.gateway);
  const configured = envAssistantGateway(wiring.env ?? process.env);
  if (configured) return configured;
  return wiring.self ? { ...normalize(wiring.self), loopback: true } : null;
}

export function assistantOperationsServedHere(
  wiring: AssistantWiring = {},
): boolean {
  if (wiring.gatewayFronted) return false;
  return envAssistantGateway(wiring.env ?? process.env) === null;
}

export function formatAssistantModeLog(wiring: AssistantWiring = {}): string {
  const env = wiring.env ?? process.env;
  const configured = envAssistantGateway(env);
  if (configured) {
    return `[local-host] assistant operations: gateway ${configured.url}`;
  }
  if (wiring.self) {
    return `[local-host] assistant operations: this host (${normalize(wiring.self).url})`;
  }
  const missing = [
    env[ASSISTANT_CP_URL_ENV]?.trim() ? null : ASSISTANT_CP_URL_ENV,
    env[ASSISTANT_TOKEN_ENV]?.trim() ? null : ASSISTANT_TOKEN_ENV,
  ].filter((name): name is string => name !== null);
  return `[local-host] assistant operations off: set ${missing.join(" and ")} to enable`;
}

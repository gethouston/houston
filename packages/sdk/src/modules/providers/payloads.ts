/**
 * Untrusted command-payload parsers for the providers module. The bridge
 * (`dispatch`) hands these raw JSON; each parser throws on a bad shape
 * (`CommandRegistry.dispatch` turns the throw into an `ok: false` result).
 *
 * `provider` is validated as a non-empty string and carried as {@link ProviderId}
 * — the runtime rejects an unknown id server-side, so the union is not
 * re-validated here (it would only drift from the wire's own list).
 */

import type { ProviderId } from "@houston/runtime-client";

function requireString(payload: unknown, key: string): string {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`missing '${key}'`);
  return value;
}

function optionalString(payload: unknown, key: string): string | undefined {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(payload: unknown, key: string): boolean | undefined {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  return typeof value === "boolean" ? value : undefined;
}

const provider = (p: unknown): ProviderId =>
  requireString(p, "provider") as ProviderId;

export const parseRefresh = (p: unknown): { agentId: string } => ({
  agentId: requireString(p, "agentId"),
});

export interface LoginArgs {
  agentId: string;
  provider: ProviderId;
  deviceAuth?: boolean;
  enterpriseDomain?: string;
}
export const parseLogin = (p: unknown): LoginArgs => ({
  agentId: requireString(p, "agentId"),
  provider: provider(p),
  deviceAuth: optionalBoolean(p, "deviceAuth"),
  enterpriseDomain: optionalString(p, "enterpriseDomain"),
});

export const parseProviderAction = (
  p: unknown,
): { agentId: string; provider: ProviderId } => ({
  agentId: requireString(p, "agentId"),
  provider: provider(p),
});

export const parseCompleteLogin = (
  p: unknown,
): { agentId: string; provider: ProviderId; code: string } => ({
  agentId: requireString(p, "agentId"),
  provider: provider(p),
  code: requireString(p, "code"),
});

export const parseSetApiKey = (
  p: unknown,
): { agentId: string; provider: ProviderId; key: string } => ({
  agentId: requireString(p, "agentId"),
  provider: provider(p),
  key: requireString(p, "key"),
});

export interface SetModelArgs {
  agentId: string;
  model?: string;
  effort?: string;
  provider?: ProviderId;
}
export const parseSetModel = (p: unknown): SetModelArgs => ({
  agentId: requireString(p, "agentId"),
  model: optionalString(p, "model"),
  effort: optionalString(p, "effort"),
  provider: optionalString(p, "provider") as ProviderId | undefined,
});

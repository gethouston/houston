import type { ProviderError } from "@houston/protocol";
import { extractHttpStatus } from "../ai/provider-error";

export interface ProviderFailureReport {
  kind: ProviderError["kind"];
  provider: string;
  status?: number;
  code?: string;
}

const PROVIDER_ID = /^[A-Za-z0-9_.:/@-]{1,64}$/;
const BODY_TOKEN =
  /"(?:code|type|title|status)"\s*:\s*"([A-Za-z][A-Za-z0-9_.-]{0,47})"/g;
const GENERIC_TOKENS = new Set(["error"]);

function bodyCode(text: string): string | undefined {
  for (const match of text.matchAll(BODY_TOKEN)) {
    const token = match[1];
    if (token && !GENERIC_TOKENS.has(token.toLowerCase())) return token;
  }
  return undefined;
}

export function providerFailureReport(
  err: ProviderError | undefined,
): ProviderFailureReport | undefined {
  if (!err) return undefined;
  const text = err.kind === "unknown" ? err.raw_excerpt : err.message;
  const status =
    err.kind === "provider_internal" && err.http_status !== null
      ? err.http_status
      : extractHttpStatus(text);
  const code = bodyCode(text);
  return {
    kind: err.kind,
    provider: PROVIDER_ID.test(err.provider) ? err.provider : "other",
    ...(status !== null && status >= 100 && status <= 599 ? { status } : {}),
    ...(code ? { code } : {}),
  };
}

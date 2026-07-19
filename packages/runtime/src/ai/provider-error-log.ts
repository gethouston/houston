import type { ProviderError } from "@houston/runtime-client";

/**
 * Kinds that are expected operational states of an EXTERNAL provider (or of
 * the user's plan) — a 429, a 503, an exhausted quota, an over-long prompt.
 * The chat already renders each as its matching inline card, so a Sentry
 * ERROR event adds no signal; captured as warning breadcrumbs they still
 * document the turn that led to a real error. `unauthenticated` and `unknown`
 * stay errors: on a managed pod an auth failure means the central credential
 * custody broke (the storm behind HOUSTON-APP-4XG), and an unclassified
 * failure is by definition something we have not seen and triaged yet.
 */
const EXPECTED_KINDS: ReadonlySet<ProviderError["kind"]> = new Set([
  "rate_limited",
  "quota_exhausted",
  "model_unavailable",
  "context_overflow",
  "provider_internal",
  "network_unreachable",
]);

export interface ProviderErrorLogContext {
  model?: string | null;
  status?: number | null;
  /** The Claude Agent SDK's own error enum, when that backend classified it. */
  sdkError?: string;
}

/**
 * The single log site for a classified provider failure — every backend logs
 * the VERBATIM provider text through here exactly once, after classification,
 * so the raw reason (an opencode.ai 401 body, an entitlement 403) is never
 * lost once collapsed into a typed card, and so severity follows the taxonomy
 * instead of blanket console.error.
 */
export function logProviderError(
  error: ProviderError,
  ctx: ProviderErrorLogContext = {},
): void {
  const verbatim = error.kind === "unknown" ? error.raw_excerpt : error.message;
  const line =
    `[provider_error] provider=${error.provider} model=${ctx.model ?? "?"} ` +
    `status=${ctx.status ?? "?"}${ctx.sdkError ? ` error=${ctx.sdkError}` : ""} ` +
    `kind=${error.kind} :: ${verbatim}`;
  if (EXPECTED_KINDS.has(error.kind)) console.warn(line);
  else console.error(line);
}

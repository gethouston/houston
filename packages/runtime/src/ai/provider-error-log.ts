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

/**
 * An abort raised out of prompt() (AbortError's "This operation was aborted")
 * is the caller cancelling the turn — a user Stop or a dropped client — not a
 * provider failure. It classifies as `unknown` (no provider text to match),
 * but reporting it as a Sentry error would page us for every cancel that
 * lands mid-request; the catch sites that own the signal suppress it, and
 * this guard keeps the ones that cannot see the signal to a warning.
 */
const EXPECTED_UNKNOWN_DETAIL = /operation was aborted/i;

/**
 * Auth bodies that are the USER's account standing, not broken credential
 * custody: ChatGPT's `deactivated_workspace` means OpenAI authenticated the
 * served token and then rejected the WORKSPACE behind it (subscription ended,
 * account deactivated). The reconnect card already tells the user, and only
 * they can fix it — a Sentry error per retried turn adds no signal
 * (PRODUCT-1547). Custody-break auth failures (4XG-style storms) carry none
 * of these bodies and stay errors.
 */
const EXPECTED_AUTH_DETAIL = /deactivated_workspace/i;

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
  // The line's format is a documented contract with the Sentry capture regex
  // (runtime-client sentry/client.ts PROVIDER_ERROR_LINE):
  //   `[provider_error] provider=X model=Y status=Z[ error=SLUG] kind=K[ cause=C] :: text`
  // `error=` (the SDK's own slug) rides BEFORE `kind=`, `cause=` right after
  // it. Sentry fingerprints per (provider, kind, cause, sdk-slug) and tags all
  // four (PRODUCT-1302, PRODUCT-1393): cause separates "provider revoked the
  // session" from "user pasted a bad key", the SDK slug separates Anthropic's
  // org-policy block from ordinary auth failures.
  const cause = error.kind === "unauthenticated" ? ` cause=${error.cause}` : "";
  const line =
    `[provider_error] provider=${error.provider} model=${ctx.model ?? "?"} ` +
    `status=${ctx.status ?? "?"}${ctx.sdkError ? ` error=${ctx.sdkError}` : ""} ` +
    `kind=${error.kind}${cause} :: ${verbatim}`;
  // Two auth causes are expected USER states, not broken custody.
  // `no_credentials`: the provider was simply never connected (or the user
  // logged out with it still selected) — loggable since the pre-session
  // guards started reporting (HOU-1156); keep it a warning or every fresh
  // install fires Sentry errors. `org_policy_blocked`: the provider
  // authenticated the token and then its org policy rejected subscription
  // access for this environment (Anthropic's `oauth_org_not_allowed`) — the
  // card already tells the user to switch to an API key, only their org admin
  // can lift the block, and every retried turn re-fires it.
  const expected =
    EXPECTED_KINDS.has(error.kind) ||
    (error.kind === "unauthenticated" &&
      (error.cause === "no_credentials" ||
        error.cause === "org_policy_blocked")) ||
    (error.kind === "unauthenticated" &&
      EXPECTED_AUTH_DETAIL.test(verbatim ?? "")) ||
    (error.kind === "unknown" && EXPECTED_UNKNOWN_DETAIL.test(verbatim ?? ""));
  if (expected) console.warn(line);
  else console.error(line);
}

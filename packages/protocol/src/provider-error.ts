/**
 * Provider failure taxonomy for a turn's model request — carried live on the
 * `provider_error` wire frame (see wire.ts) and persisted on the turn's
 * assistant message (`ChatMessage.providerError`, conversation.ts).
 */

/**
 * Why an `unauthenticated` provider error happened. Mirrors the frontend
 * `AuthFailureCause` (`@houston-ai/chat`) so the typed reconnect card reads it
 * straight off the wire and picks the right body copy + reconnect lifecycle.
 *
 * - `no_credentials` — never connected (surfaced separately at send time, not
 *   from a live turn).
 * - `token_expired` — the credential lapsed; logging in again recovers it.
 * - `token_revoked` — the provider ended the session server-side (the terminal
 *   session-kill, e.g. Codex `app_session_terminated` / "your session has ended").
 * - `invalid_api_key` — a pasted key the provider rejected.
 */
export type AuthFailureCause =
  | "no_credentials"
  | "token_expired"
  | "token_revoked"
  | "invalid_api_key"
  | "unknown";

/**
 * Why a `model_unavailable` provider error happened. Mirrors the frontend
 * `ModelUnavailableReason` (`@houston-ai/chat`) so the wire shape stays
 * assignable to the card's union. The runtime can't always tell the precise
 * sub-reason from the gateway's flat string (GitHub Copilot just says
 * `model_not_supported`), so `unknown` is the common case; the actionable detail
 * is the `suggested_fallback`, not this tag.
 */
export type ModelUnavailableReason =
  | "preview_gated"
  | "deprecated"
  | "region_restricted"
  | "unknown";

/**
 * How a `quota_exhausted` limit is scoped. Mirrors the frontend `QuotaScope`
 * (`@houston-ai/chat`). Informational today — the card copy keys off `resets_at`,
 * not this.
 */
export type QuotaScope = "free_tier" | "paid_plan" | "organization" | "unknown";

/**
 * A typed provider/auth/model failure for a turn's model request. Mirrors the
 * relevant subset of the frontend `ProviderError` union (`@houston-ai/chat`) so
 * it renders as the matching inline card (UnauthenticatedCard / RateLimitedCard /
 * ProviderInternalCard / NetworkUnreachableCard / UnknownErrorCard). The runtime
 * classifies pi's errored `AssistantMessage` (provider + model + errorMessage)
 * into one of these — see runtime `ai/provider-error.ts`. `provider` is the pi
 * provider id; the frontend maps it to its own id when rendering.
 */
export type ProviderError =
  | {
      kind: "unauthenticated";
      provider: string;
      cause: AuthFailureCause;
      message: string;
    }
  | {
      kind: "rate_limited";
      provider: string;
      model: string | null;
      retry_after_seconds: number | null;
      message: string;
    }
  | {
      /**
       * The account is out of credit / lacks the subscription for the requested
       * model — the "pay or switch" outcome, distinct from a wait-out rate limit
       * and from auth (the credential is valid). opencode.ai returns this as
       * `401 CreditsError "Insufficient balance"`, so it must NOT render a
       * reconnect card. Mirrors the frontend `quota_exhausted` card.
       */
      kind: "quota_exhausted";
      provider: string;
      model: string | null;
      scope: QuotaScope;
      /** Reset hint when the provider gives one; null = open-ended (top up / upgrade). */
      resets_at: string | null;
      message: string;
    }
  | {
      /**
       * The model the turn ran on isn't available to this credential's plan —
       * e.g. GitHub Copilot Free answers a premium model (Claude / GPT-5.x) it
       * doesn't include with `400 model_not_supported`. Distinct from auth (the
       * credential is fine) and rate/quota (nothing to wait out): the fix is to
       * pick a different model, so `suggested_fallback` names a known-good one
       * (a Copilot base model every plan serves) when we have one.
       */
      kind: "model_unavailable";
      provider: string;
      model: string;
      reason: ModelUnavailableReason;
      suggested_fallback: string | null;
      message: string;
    }
  | {
      kind: "provider_internal";
      provider: string;
      http_status: number | null;
      message: string;
    }
  | { kind: "network_unreachable"; provider: string; message: string }
  | { kind: "unknown"; provider: string; raw_excerpt: string };

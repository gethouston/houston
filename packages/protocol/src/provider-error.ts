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
 * - `org_policy_blocked` — the provider's organization/policy blocked
 *   subscription access for this environment (Anthropic's
 *   `oauth_org_not_allowed`, e.g. subscription OAuth denied from datacenter
 *   IPs). The credential itself is not the problem, so reconnecting does NOT
 *   heal it; the remedy is connecting with an API key instead.
 */
export type AuthFailureCause =
  | "no_credentials"
  | "token_expired"
  | "token_revoked"
  | "invalid_api_key"
  | "org_policy_blocked"
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
  // Azure OpenAI's DeploymentNotFound: the RESOURCE has no deployment named
  // after the model. Switching models cannot help until the user deploys one
  // (deployment name must equal the model id), so the card must say "deploy
  // it", not "pick another".
  | "not_deployed"
  | "unknown";

/**
 * How a `quota_exhausted` limit is scoped. Mirrors the frontend `QuotaScope`
 * (`@houston-ai/chat`). Informational today — the card copy keys off `resets_at`,
 * not this.
 */
export type QuotaScope = "free_tier" | "paid_plan" | "organization" | "unknown";

/**
 * WHICH credential ran the failed turn. Present only on a managed-cloud turn
 * that carried an acting identity — absent on desktop, self-host, and any turn
 * with no acting identity, where there is exactly one credential and nothing to
 * name.
 *
 * It exists so a failure card can be HONEST about whose account hit the wall
 * (HOU-976): in a team space every turn runs on the acting member's own AI
 * account, so "your Anthropic account is rate limited" is a true sentence and a
 * generic one is not. There is no fallback to offer — a team space has no shared
 * AI credential — so this only names, it never unlocks an action.
 */
export interface ProviderErrorCredential {
  scope: "personal" | "team";
}

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
      /**
       * The turn's user text when it never reached the MODEL: pi raises a
       * missing/expired credential at prompt time, BEFORE recording the
       * message in its session store, so neither the live context nor a
       * session rebuild ever sees it (HOU-718). The reconnect retry must
       * re-deliver this text (the surface hides the re-send under its
       * auto-continue marker — the transcript already shows the original,
       * persisted bubble). Distinct from the frontend-only `failed_prompt`,
       * which marks a send the ENGINE refused before persisting anything.
       */
      undelivered_prompt?: string;
      /** WHOSE credential ran this turn (HOU-976); absent without an acting identity. */
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "rate_limited";
      provider: string;
      model: string | null;
      retry_after_seconds: number | null;
      message: string;
      /** WHOSE credential ran this turn (HOU-976); absent without an acting identity. */
      credential?: ProviderErrorCredential;
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
      /** WHOSE credential ran this turn (HOU-976); absent without an acting identity. */
      credential?: ProviderErrorCredential;
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
      /** WHOSE credential ran this turn (HOU-976); absent without an acting identity. */
      credential?: ProviderErrorCredential;
    }
  | {
      /**
       * The conversation no longer fits the model's context window — the
       * provider rejected the request outright (llama.cpp/Jan's
       * `exceed_context_size_error`, OpenAI's `context_length_exceeded`,
       * Anthropic's "prompt is too long"). Distinct from `model_unavailable`
       * (the model itself is fine) and from rate/quota (nothing to wait out):
       * the recovery is a larger-window model or a fresh conversation. The
       * token fields carry the provider's own numbers when it named them —
       * `context_window_tokens` is the model's REAL window, which the runtime
       * also uses to correct an over-assumed custom-endpoint window
       * (`learnCustomContextWindow`).
       */
      kind: "context_overflow";
      provider: string;
      model: string | null;
      context_window_tokens: number | null;
      prompt_tokens: number | null;
      message: string;
      /** WHOSE credential ran this turn (HOU-976); absent without an acting identity. */
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "provider_internal";
      provider: string;
      http_status: number | null;
      message: string;
      /** WHOSE credential ran this turn (HOU-976); absent without an acting identity. */
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "network_unreachable";
      provider: string;
      message: string;
      /** WHOSE credential ran this turn (HOU-976); absent without an acting identity. */
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "unknown";
      provider: string;
      raw_excerpt: string;
      /** WHOSE credential ran this turn (HOU-976); absent without an acting identity. */
      credential?: ProviderErrorCredential;
    };

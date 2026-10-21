/**
 * Provider failure taxonomy for a turn's model request — carried live on the
 * `provider_error` wire frame (see wire.ts) and persisted on the turn's
 * assistant message (`ChatMessage.providerError`, conversation.ts).
 */

import type {
  AuthFailureCause,
  ModelUnavailableReason,
  ProviderErrorCredential,
  QuotaScope,
} from "./provider-error-parts";

/**
 * The `code` the gateway's credential serve, the host's own sandbox serve and
 * the pool's send refusal all carry for a provider that blocks the account
 * behind an intact credential (`billing_locked` in AuthFailureCause). One
 * constant so the host, the runtime's serve probe and the SDK read one string.
 */
export const PROVIDER_ACCOUNT_BLOCKED_CODE = "provider_account_blocked";

export type {
  AuthFailureCause,
  ModelUnavailableReason,
  ProviderErrorCredential,
  QuotaScope,
} from "./provider-error-parts";

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
      kind: "plan_message_limit";
      provider: string;
      resets_at: string;
      message: string;
      /** Whose allowance ran out: a free org's pool or one paid seat's. */
      scope?: "org" | "seat";
      credential?: ProviderErrorCredential;
    }
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
       * A subscription plan's usage window is used up: Anthropic's 5-hour
       * session limit and its weekly per-model limits (Claude Code reports
       * both as a `rate_limit` with `rate_limit_info.status: "rejected"`).
       * Distinct from `rate_limited` (seconds to wait, retrying is the
       * remedy) and from `quota_exhausted` (nothing comes back on its own,
       * pay or switch): here nothing is owed and retrying fails until
       * `resets_at`, so the remedies are waiting or running another model.
       * The routine scheduler snoozes a routine until the reset on this kind
       * (domain `routine-snooze.ts`) instead of firing into the wall.
       */
      kind: "usage_limit_paused";
      provider: string;
      model: string | null;
      /** ISO 8601 reset instant when the provider named one; null = unknown. */
      resets_at: string | null;
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
      /**
       * The model's reply broke mid-generation: the runtime cut a repetition
       * loop ("SymbolSymbolSymbol…") before it ran to the output limit.
       * Transient, a retry usually comes back clean. Mirrors the frontend
       * `malformed_response` card.
       */
      kind: "malformed_response";
      provider: string;
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

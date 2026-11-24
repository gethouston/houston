/**
 * Who wrote a user message in a multiplayer conversation (C5). Mirrors the
 * protocol `ChatMessage.author`. `name` is a best-effort display name; when
 * absent the consumer falls back to the userId. Props-only — no store or
 * i18n imports (library boundary).
 */
export interface MessageAuthor {
  userId: string;
  name?: string;
}

/**
 * One @mention of a human inside a chat message. Mirrors the
 * protocol `ChatMessage.mentions[]` entry. Recorded on USER turns only — an
 * agent addresses someone in plain prose, never as structured data. `name` is
 * the display name as it appeared after the "@" when the message was sent, so
 * the renderer can still find the run after the person was renamed.
 */
export interface MessageMention {
  userId: string;
  name?: string;
}

/**
 * A person the composer can @mention and the renderer can chip. Supplied by
 * the consumer (the app resolves the space roster); `ui/` never fetches.
 */
export interface MentionPerson {
  userId: string;
  /**
   * Display name, as it appears after the "@". Required: a person with no
   * known name is never offered, because an "@a1b2c3d4" chip is nonsense to a
   * non-technical reader.
   */
  name: string;
  imageUrl?: string;
}

type FeedItemIdentity = { id?: string };

/** The engine-authored system lines a host may localize by kind. */
export type SystemNoticeKind =
  | "engine_restart"
  | "engine_resumed"
  | "sandbox_lost"
  | "turn_time_limit"
  | "turn_time_limit_unsaved"
  | "send_busy"
  | "compute_busy"
  | "agent_too_large"
  | "agent_setup_failed"
  | "turn_unconfirmed"
  | "files_not_saved";

/**
 * A row the host draws itself, placed in the log like any message. `kind`
 * names it and `payload` carries what the host needs to draw it; the chat
 * never reads either, and hands the row to `renderSystemMessage`. Never on
 * the wire: a host adds it when it maps its feed.
 */
export interface HostCard {
  kind: string;
  payload: unknown;
  /** The card shows its own progress while a turn runs, so the log draws no
   *  thinking line under it. */
  ownsProgress?: boolean;
}

export type FeedItem = FeedItemVariant & FeedItemIdentity;

type FeedItemVariant =
  | { feed_type: "assistant_text"; data: string }
  | { feed_type: "assistant_text_streaming"; data: string }
  | { feed_type: "thinking"; data: string }
  | { feed_type: "thinking_streaming"; data: string }
  | {
      feed_type: "user_message";
      data: string;
      author?: MessageAuthor;
      mentions?: MessageMention[];
      turnId?: string;
    }
  | { feed_type: "provider_error"; data: ProviderError }
  | { feed_type: "host_card"; data: HostCard }
  | { feed_type: "tool_call"; data: { name: string; input: unknown } }
  | {
      feed_type: "tool_result";
      data: {
        name?: string;
        content: string;
        is_error: boolean;
        mission?: { id: string; title: string; agent: string };
      };
    }
  | {
      feed_type: "system_message";
      data: string;
      notice?: SystemNoticeKind;
      noticeData?: unknown;
    }
  | {
      feed_type: "context_compacted";
      data: {
        trigger: "native" | "proactive" | "manual";
        pre_tokens?: number | null;
      };
    }
  | {
      feed_type: "context_cleared";
      data: null;
    }
  | {
      feed_type: "provider_switched";
      data: {
        provider: string;
        summarized: boolean;
        pre_tokens?: number | null;
      };
    }
  | {
      feed_type: "file_changes";
      data: { created: string[]; modified: string[] };
    }
  | {
      feed_type: "final_result";
      data: {
        result: string;
        cost_usd: number | null;
        duration_ms: number | null;
        usage?: TokenUsage | null;
      };
    };

/**
 * Provider-agnostic token usage for one turn. Mirrors the Rust `TokenUsage`
 * in `houston-terminal-manager`. `context_tokens` is the prompt size of the
 * most recent model request, i.e. how much of the context window is in use;
 * `cached_tokens` (a subset) and `output_tokens` are informational detail.
 */
export interface TokenUsage {
  context_tokens: number;
  output_tokens: number;
  cached_tokens: number;
}

/**
 * Typed provider failure surfaced by the engine. Mirrors the Rust
 * `ProviderError` enum in `houston-terminal-manager`. The frontend
 * renders one card per `kind` with variant-appropriate CTAs; new
 * variants must be added here AND in the engine's enum simultaneously.
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
      kind: "rate_limited";
      provider: string;
      model: string | null;
      retry_after_seconds: number | null;
      message: string;
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "quota_exhausted";
      provider: string;
      model: string | null;
      scope: QuotaScope;
      /** Human-readable reset hint (e.g. "Jul 1st, 2026 1:16 PM"); null when open-ended. */
      resets_at: string | null;
      message: string;
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "usage_limit_paused";
      provider: string;
      /** ISO 8601 reset instant (the card formats it in the viewer's zone); null if unknown. */
      resets_at: string | null;
      message: string;
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "model_unavailable";
      provider: string;
      model: string;
      reason: ModelUnavailableReason;
      suggested_fallback: string | null;
      message: string;
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "unauthenticated";
      provider: string;
      cause: AuthFailureCause;
      message: string;
      /**
       * Client-synthesized only (never on the wire): the prompt whose SEND the
       * engine refused because no provider was connected. The message never
       * reached the engine, so the card's "Send again" must resend THIS text —
       * a generic "try again" prompt would arrive with no context to retry.
       */
      failed_prompt?: string;
      /**
       * Wire-carried: the turn's user text when the engine PERSISTED
       * it but the model never received it — pi raises a missing credential at
       * prompt time, before recording the message in its session store. The
       * reconnect retry re-delivers this text hidden under the auto-continue
       * marker: the transcript already shows the original bubble, so unlike
       * `failed_prompt` the re-send must never render a second one.
       */
      undelivered_prompt?: string;
      credential?: ProviderErrorCredential;
    }
  | {
      /**
       * The conversation no longer fits the model's context window — the
       * provider rejected the request outright. Not a credential/quota/server
       * fault: the recovery is a larger-window model or a fresh conversation,
       * so the card's CTA opens the model picker. Token counts are the
       * provider's own numbers when it named them.
       */
      kind: "context_overflow";
      provider: string;
      model: string | null;
      context_window_tokens: number | null;
      prompt_tokens: number | null;
      message: string;
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "network_unreachable";
      provider: string;
      message: string;
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "provider_internal";
      provider: string;
      http_status: number | null;
      message: string;
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "session_resume_missing";
      provider: string;
      session_id: string;
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "malformed_response";
      provider: string;
      message: string;
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "spawn_failed";
      provider: string;
      cli_name: string;
      message: string;
      credential?: ProviderErrorCredential;
    }
  | { kind: "cancelled"; provider: string }
  | {
      kind: "unknown";
      provider: string;
      raw_excerpt: string;
      credential?: ProviderErrorCredential;
    };

export interface ProviderErrorCredential {
  scope: "personal" | "team";
}

export type QuotaScope = "free_tier" | "paid_plan" | "organization" | "unknown";

export type ModelUnavailableReason =
  | "preview_gated"
  | "deprecated"
  | "region_restricted"
  | "not_deployed"
  | "unknown";

export type AuthFailureCause =
  | "no_credentials"
  | "token_expired"
  | "token_revoked"
  | "invalid_api_key"
  | "org_policy_blocked"
  | "billing_locked"
  | "unknown";

export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "approved"
  | "needs_you"
  | "done"
  | "error";

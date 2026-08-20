// Chat-related types extracted from Houston's type system.
// Only the types needed by chat components are included here.

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
 * One @mention of a human inside a chat message (HOU-944). Mirrors the
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

/**
 * Optional stable identity for a feed item, carried from the conversation
 * view-model's feed entries. When present it keys the rendered message, so
 * PREPENDING older items (scroll-up lazy-load, HOU-819) never re-keys the
 * items below — positional keys would hand every existing Streamdown
 * instance a different message's content (the #364 stale-render class).
 * Absent on id-less feeds (tests, standalone consumers): keys fall back to
 * positional and behave exactly as before.
 */
type FeedItemIdentity = { id?: string };

export type FeedItem = FeedItemVariant & FeedItemIdentity;

type FeedItemVariant =
  | { feed_type: "assistant_text"; data: string }
  | { feed_type: "assistant_text_streaming"; data: string }
  | { feed_type: "thinking"; data: string }
  | { feed_type: "thinking_streaming"; data: string }
  | {
      feed_type: "user_message";
      data: string;
      /**
       * Multiplayer only: who wrote this message (C5). Set only in shared
       * conversations so the renderer can label a teammate's bubble. Absent in
       * single-player mode — the bubble renders exactly as before.
       */
      author?: MessageAuthor;
      /**
       * The teammates this message @mentioned (HOU-944). Drives the chips in
       * the sent bubble; absent when the message mentioned nobody.
       */
      mentions?: MessageMention[];
      /**
       * The wire id of the turn this message started (PRODUCT-1217). Present
       * on server-persisted and settled live messages; absent on a still-
       * optimistic send and on pre-turn-id transcripts. The edit-and-resend
       * affordance anchors on it — no id, no edit.
       */
      turnId?: string;
    }
  | { feed_type: "tool_runtime_error"; data: ToolRuntimeErrorEntry }
  | { feed_type: "provider_error"; data: ProviderError }
  | { feed_type: "tool_call"; data: { name: string; input: unknown } }
  | { feed_type: "tool_result"; data: { content: string; is_error: boolean } }
  | { feed_type: "system_message"; data: string }
  | {
      /**
       * A context-compaction boundary. Earlier turns were summarized to free
       * context, either by the provider CLI itself (`native`) or by Houston's
       * proactive reseed (`proactive`). Rendered as a subtle divider; the full
       * chat above and below stays visible. `pre_tokens` is how full the
       * context was just before compaction, when reported.
       */
      feed_type: "context_compacted";
      data: { trigger: "native" | "proactive"; pre_tokens?: number | null };
    }
  | {
      /**
       * A provider-switch boundary. The conversation was handed to a different
       * provider mid-session; the new provider ran a fresh session seeded with
       * prior context — the full transcript (`summarized: false`) or an AI
       * summary (`summarized: true`). Rendered as a subtle divider; the full
       * chat above and below stays visible. `provider` is the provider switched
       * TO. `pre_tokens` is how full the leaving provider's context was, when
       * reported.
       */
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
        /**
         * Normalized token usage for the turn. Present for providers that
         * report it (Anthropic, Codex); `null`/absent otherwise. Drives the
         * composer context-usage indicator.
         */
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

export interface ToolRuntimeErrorEntry {
  kind: "local_tool" | "provider_process" | "provider_model_unsupported";
  details: string;
}

/**
 * Typed provider failure surfaced by the engine. Mirrors the Rust
 * `ProviderError` enum in `houston-terminal-manager`. The frontend
 * renders one card per `kind` with variant-appropriate CTAs; new
 * variants must be added here AND in the engine's enum simultaneously.
 */
export type ProviderError =
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
      /** Human-readable reset hint (e.g. "3:30 PM" or "5pm (America/Bogota)"); null if unknown. */
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
       * Wire-carried (HOU-718): the turn's user text when the engine PERSISTED
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

/**
 * WHICH credential ran the failed turn. Mirrors `@houston/protocol`'s
 * `ProviderErrorCredential`.
 *
 * Present only on a managed-cloud turn that carried an acting identity — absent
 * on desktop, self-host and any turn with no acting identity, where there is one
 * credential and nothing to name. It lets a failure card say whose account hit
 * the wall (in a team space, always the acting member's own); it unlocks no
 * action, because a team space has no shared AI credential to fall back on.
 */
export interface ProviderErrorCredential {
  scope: "personal" | "team";
}

export type QuotaScope = "free_tier" | "paid_plan" | "organization" | "unknown";

export type ModelUnavailableReason =
  | "preview_gated"
  | "deprecated"
  | "region_restricted"
  | "unknown";

export type AuthFailureCause =
  | "no_credentials"
  | "token_expired"
  | "token_revoked"
  | "invalid_api_key"
  // The provider's organization/policy blocked subscription access for this
  // environment (Anthropic's `oauth_org_not_allowed`). Reconnecting does NOT
  // heal it; the card's action points at using an API key instead.
  | "org_policy_blocked"
  | "unknown";

export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "approved"
  | "needs_you"
  | "done"
  | "error";

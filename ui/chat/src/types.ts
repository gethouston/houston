// Chat-related types extracted from Houston's type system.
// Only the types needed by chat components are included here.

export type FeedItem =
  | { feed_type: "assistant_text"; data: string }
  | { feed_type: "assistant_text_streaming"; data: string }
  | { feed_type: "thinking"; data: string }
  | { feed_type: "thinking_streaming"; data: string }
  | { feed_type: "user_message"; data: string }
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
    }
  | {
      kind: "quota_exhausted";
      provider: string;
      model: string | null;
      scope: QuotaScope;
      message: string;
      upgrade_url: string | null;
    }
  | {
      kind: "usage_limit_paused";
      provider: string;
      /** Human-readable reset hint (e.g. "3:30 PM" or "5pm (America/Bogota)"); null if unknown. */
      resets_at: string | null;
      message: string;
    }
  | {
      kind: "model_unavailable";
      provider: string;
      model: string;
      reason: ModelUnavailableReason;
      suggested_fallback: string | null;
      message: string;
    }
  | {
      kind: "unauthenticated";
      provider: string;
      cause: AuthFailureCause;
      message: string;
    }
  | { kind: "network_unreachable"; provider: string; message: string }
  | {
      kind: "provider_internal";
      provider: string;
      http_status: number | null;
      message: string;
    }
  | {
      kind: "session_resume_missing";
      provider: string;
      session_id: string;
    }
  | { kind: "malformed_response"; provider: string; message: string }
  | {
      kind: "spawn_failed";
      provider: string;
      cli_name: string;
      message: string;
    }
  | { kind: "cancelled"; provider: string }
  | { kind: "unknown"; provider: string; raw_excerpt: string };

export type QuotaScope =
  | "free_tier"
  | "paid_plan"
  | "organization"
  | "unknown";

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
  | "unknown";

export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "approved"
  | "needs_you"
  | "done"
  | "error";

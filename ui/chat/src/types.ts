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
  | {
      feed_type: "tool_call";
      data: { name: string; input: unknown; tool_use_id?: string };
    }
  | {
      feed_type: "tool_result";
      data: {
        content: string;
        is_error: boolean;
        tool_use_id?: string;
      };
    }
  | { feed_type: "system_message"; data: string }
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
      };
    };

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

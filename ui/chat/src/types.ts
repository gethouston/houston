export interface MessageAuthor {
  userId: string;
  name?: string;
}

export interface MessageMention {
  userId: string;
  name?: string;
}

export interface MentionPerson {
  userId: string;
  name: string;
  imageUrl?: string;
}

type FeedItemIdentity = { id?: string };

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
  | "turn_unconfirmed";

export interface HostCard {
  kind: string;
  payload: unknown;
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

export interface TokenUsage {
  context_tokens: number;
  output_tokens: number;
  cached_tokens: number;
}

export type ProviderError =
  | {
      kind: "plan_message_limit";
      provider: string;
      resets_at: string;
      message: string;
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
      resets_at: string | null;
      message: string;
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "usage_limit_paused";
      provider: string;
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
      failed_prompt?: string;
      undelivered_prompt?: string;
      credential?: ProviderErrorCredential;
    }
  | {
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

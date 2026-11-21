import type {
  AuthFailureCause,
  ModelUnavailableReason,
  ProviderErrorCredential,
  QuotaScope,
} from "./provider-error-parts";

export const PROVIDER_ACCOUNT_BLOCKED_CODE = "provider_account_blocked";

export type {
  AuthFailureCause,
  ModelUnavailableReason,
  ProviderErrorCredential,
  QuotaScope,
} from "./provider-error-parts";

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
      kind: "unauthenticated";
      provider: string;
      cause: AuthFailureCause;
      message: string;
      undelivered_prompt?: string;
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
      kind: "usage_limit_paused";
      provider: string;
      model: string | null;
      resets_at: string | null;
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
      kind: "model_unavailable";
      provider: string;
      model: string;
      reason: ModelUnavailableReason;
      suggested_fallback: string | null;
      message: string;
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
      kind: "provider_internal";
      provider: string;
      http_status: number | null;
      message: string;
      credential?: ProviderErrorCredential;
    }
  | {
      kind: "malformed_response";
      provider: string;
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
      kind: "unknown";
      provider: string;
      raw_excerpt: string;
      credential?: ProviderErrorCredential;
    };

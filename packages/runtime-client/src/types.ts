export type {
  AuthFailureCause,
  AuthStatus,
  ChatMessage,
  ChatRole,
  ClaudeOAuthCredential,
  ConversationHistory,
  ConversationSummary,
  CustomEndpoint,
  HandsOnSurface,
  InteractionOption,
  InteractionStep,
  LoginInfo,
  LoginState,
  LoginStatus,
  PendingInteraction,
  ProviderAuth,
  ProviderError,
  ProviderErrorCredential,
  ProviderId,
  ProviderInfo,
  ProviderUsage,
  ProviderUsageCredits,
  ProviderUsageStatus,
  ProviderUsageTokens,
  ProviderUsageWindow,
  ProviderUsageWindowId,
  Settings,
  TokenUsage,
  ToolCallRecord,
  WireEvent,
  WireEventType,
  WireFrame,
  Workspace,
} from "@houston/protocol";
export {
  clipToolResult,
  parseClaudeOAuthEnvelope,
  TOOL_RESULT_PREVIEW_MAX,
} from "@houston/protocol";

export const PROTOCOL_VERSION = 2;

export interface IntegrationProviderStatus {
  provider: string;
  ready: boolean;
  reason?: "signin";
  reconnect?: boolean;
}

export interface IntegrationToolkit {
  slug: string;
  name: string;
  description?: string;
  logoUrl?: string;
  categories?: string[];
  noAuth?: boolean;
}

export interface IntegrationConnection {
  toolkit: string;
  connectionId: string;
  status: "active" | "pending" | "error";
  accountLabel?: string;
  createdAt?: string;
}

export interface PreferenceValue {
  value: string | null;
}

export interface EngineClientConfig {
  baseUrl: string;
  token?: string;
  fetch?: typeof fetch;
}

export interface HealthResponse {
  status: "ok";
  version: string;
}

export interface VersionResponse {
  engine: string;
  protocol: number;
}

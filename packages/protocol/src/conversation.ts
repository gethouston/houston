import type { PendingInteraction } from "./domain/interaction";
import type { ManagedBridgeEndpoint } from "./local-model-bridge";
import type { ProviderError } from "./provider-error";
import type { UnsavedFilesReport } from "./turn-unsaved-files";

export type ProviderId =
  | "anthropic"
  | "openai-codex"
  | "github-copilot"
  | "openrouter"
  | "deepseek"
  | "google"
  | "amazon-bedrock"
  | "minimax"
  | "opencode"
  | "opencode-go"
  | "openai-compatible"
  | (string & {});

export type LoginStatus = "starting" | "awaiting_user" | "complete" | "error";

export type LoginInfo =
  | { kind: "url"; url: string }
  | { kind: "auth_code"; url: string; instructions?: string }
  | { kind: "device_code"; verificationUri: string; userCode: string };

export interface LoginState {
  status: LoginStatus;
  info?: LoginInfo;
  error?: string;
}

export interface ProviderAuth {
  provider: ProviderId;
  name: string;
  configured: boolean;
  login: LoginState | null;
  enterpriseUrl?: string | null;
}

export interface AuthStatus {
  providers: ProviderAuth[];
  activeProvider: ProviderId | null;
}

export type ProviderHealth =
  | "connected"
  | "not_connected"
  | "needs_reconnect"
  | "out_of_credits"
  | "unreachable";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  configured: boolean;
  isActive: boolean;
  activeModel: string;
  models: string[];
  credentialScope?: "personal" | "team";
  health?: ProviderHealth;
  reconnectBy?: number;
}

export type ProviderUsageWindowId =
  | "session"
  | "week"
  | "week_opus"
  | "month"
  | "premium"
  | "chat"
  | "completions";

export interface ProviderUsageWindow {
  id: ProviderUsageWindowId;
  usedPercent: number;
  resetsAt: string | null;
  windowMinutes?: number;
}

export interface ProviderUsageCredits {
  remaining: number;
  granted?: number;
  unit: "USD" | "credits";
}

export interface ProviderUsageTokens {
  inputTokens: number;
  outputTokens: number;
  turns: number;
  since: string;
}

export type ProviderUsageStatus =
  | "ok"
  | "unsupported"
  | "unauthenticated"
  | "error";

export interface ProviderUsage {
  provider: ProviderId;
  status: ProviderUsageStatus;
  windows: ProviderUsageWindow[];
  credits?: ProviderUsageCredits;
  tokens?: ProviderUsageTokens;
  plan?: string;
  fetchedAt?: string;
  message?: string;
}

export interface CustomEndpoint {
  bridge?: ManagedBridgeEndpoint;
  baseUrl: string;
  model: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  shared?: boolean;
  apiKey?: string;
}

export interface Settings {
  activeProvider?: ProviderId;
  models?: Partial<Record<ProviderId, string>>;
  effort?: string;
}

export type TurnMode = "execute" | "plan" | "auto";
export const TURN_MODES: readonly TurnMode[] = ["execute", "plan", "auto"];
export const DEFAULT_TURN_MODE: TurnMode = "execute";

export function normalizeTurnMode(value: unknown): TurnMode {
  return TURN_MODES.includes(value as TurnMode)
    ? (value as TurnMode)
    : DEFAULT_TURN_MODE;
}

export function parseTurnModePin(value: unknown): TurnMode | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return normalizeTurnMode(value);
}

export type ChatRole = "user" | "assistant";

export interface ToolCallRecord {
  name: string;
  input?: unknown;
  result?: string;
  isError?: boolean;
  mission?: { id: string; title: string; agent: string };
}

export interface TokenUsage {
  context_tokens: number;
  output_tokens: number;
  cached_tokens: number;
}

export interface ChatMessage {
  nonce?: string;
  role: ChatRole;
  content: string;
  displayText?: string;
  ts: number;
  turnId?: string;
  author?: { userId: string; name?: string };
  mentions?: { userId: string; name?: string }[];
  tools?: ToolCallRecord[];
  thinking?: string;
  usage?: TokenUsage | null;
  providerSwitch?: {
    provider: string;
    summarized: boolean;
    pre_tokens?: number | null;
  };
  compaction?: {
    trigger: "native" | "proactive" | "manual";
    pre_tokens?: number | null;
  };
  compactionSummary?: true;
  contextCleared?: true;
  fileChanges?: { created: string[]; modified: string[] };
  unsavedFiles?: UnsavedFilesReport;
  providerError?: ProviderError;
  pendingInteraction?: PendingInteraction;
  stopped?: true;
  interrupted?: TurnInterruption;
  stopReason?: import("./turn-error").TurnErrorCode;
}

export type TurnInterruptionCause = "engine_restart" | "sandbox_lost";

export interface TurnInterruption {
  cause: TurnInterruptionCause;
  tool?: string;
  resumed?: true;
}

export const MENTIONS_MAX = 32;

export const MENTION_USER_ID_MAX = 128;

export const MENTION_NAME_MAX = 256;

export const MENTIONS_SCAN_MAX = 1000;

export function parseMentions(value: unknown): ChatMessage["mentions"] {
  if (!Array.isArray(value)) return undefined;
  const out: NonNullable<ChatMessage["mentions"]> = [];
  const seen = new Set<string>();
  const scanned = Math.min(value.length, MENTIONS_SCAN_MAX);
  for (let i = 0; i < scanned; i += 1) {
    if (out.length >= MENTIONS_MAX) break;
    const entry = value[i];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      continue;
    const { userId, name } = entry as { userId?: unknown; name?: unknown };
    if (typeof userId !== "string" || !userId) continue;
    const id = userId.slice(0, MENTION_USER_ID_MAX);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(
      typeof name === "string"
        ? { userId: id, name: name.slice(0, MENTION_NAME_MAX) }
        : { userId: id },
    );
  }
  return out.length ? out : undefined;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessage?: string;
}

export interface ConversationHistory {
  id: string;
  title: string;
  messages: ChatMessage[];
  offset?: number;
  totalMessages?: number;
}

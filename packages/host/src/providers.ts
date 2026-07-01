import type { ProviderId } from "@houston/protocol";

/**
 * Host-side provider catalog. The runtime (packages/runtime) owns the full model
 * lists; the host only needs to know which providers exist, how they authenticate,
 * and which ones the cloud per-turn runtime offers — for the api-key submit route
 * and the cloudrun providers/auth-status listing. The standing-runtime (proxy)
 * path doesn't use this: it relays the runtime's own /providers + /auth/* surface.
 */

export type ProviderAuthMethod = "oauth" | "apiKey" | "openaiCompatible";

export interface HostProvider {
  id: ProviderId;
  name: string;
  auth: ProviderAuthMethod;
  /** Offered on the cloud per-turn runtime. Anthropic stays off in cloud (ToS). */
  cloud: boolean;
  /**
   * Curated model ids the cloud per-turn `/providers` listing advertises. Codex
   * gets its list injected (deps.codexModels), so it's omitted here; the api-key
   * gateways carry a small curated set. The standing-runtime path ignores this —
   * it relays the runtime's own getModels()-derived list.
   */
  models?: readonly string[];
  /** Default model for the cloud listing's activeModel when settings has none. */
  defaultModel?: string;
}

export const PROVIDERS: readonly HostProvider[] = [
  { id: "anthropic", name: "Claude (Pro / Max)", auth: "oauth", cloud: false },
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    auth: "oauth",
    cloud: true,
  },
  // GitHub Copilot subscription (OAuth, GitHub device-code flow). LOCAL/desktop
  // only: the cloud per-turn sandbox is egress-locked and
  // api.individual.githubcopilot.com isn't on its allowlist. The runtime serves
  // Copilot's full model list via the standing-runtime /providers relay, so no
  // curated `models` here (same as the other OAuth providers).
  { id: "github-copilot", name: "GitHub Copilot", auth: "oauth", cloud: false },
  {
    id: "opencode",
    name: "OpenCode Zen",
    auth: "apiKey",
    cloud: true,
    models: [
      "claude-sonnet-4-6",
      "claude-opus-4-8",
      "gpt-5.5",
      "gemini-3.5-flash",
      // Free trial models — test the provider without spending credits.
      "deepseek-v4-flash-free",
      "minimax-m3-free",
      "mimo-v2.5-free",
      "nemotron-3-ultra-free",
    ],
    defaultModel: "claude-sonnet-4-6",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    auth: "apiKey",
    cloud: true,
    models: [
      "glm-5.1",
      "kimi-k2.6",
      "minimax-m3",
      "qwen3.7-max",
      "deepseek-v4-pro",
    ],
    defaultModel: "glm-5.1",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    auth: "apiKey",
    // LOCAL/desktop only for now: the cloud per-turn sandbox is egress-locked
    // and openrouter.ai isn't on its allowlist (unlike OpenCode's gateway).
    cloud: false,
    models: [
      "anthropic/claude-sonnet-4.6",
      "anthropic/claude-opus-4.8",
      "google/gemini-3-flash-preview",
      "deepseek/deepseek-v4-pro",
    ],
    defaultModel: "anthropic/claude-sonnet-4.6",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    auth: "apiKey",
    // LOCAL/desktop only for now: the cloud per-turn sandbox is egress-locked
    // and api.deepseek.com isn't on its allowlist.
    cloud: false,
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    defaultModel: "deepseek-v4-flash",
  },
  {
    id: "google",
    name: "Google Gemini",
    auth: "apiKey",
    // LOCAL/desktop only: cloud egress doesn't allowlist generativelanguage.
    cloud: false,
    models: [
      "gemini-3-flash-preview",
      "gemini-3-pro-preview",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ],
    defaultModel: "gemini-3-flash-preview",
  },
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    auth: "apiKey",
    // LOCAL/desktop only for now: the cloud per-turn sandbox egress is not
    // allowlisted for Bedrock runtime endpoints.
    cloud: false,
    models: [
      "anthropic.claude-sonnet-4-6",
      "anthropic.claude-opus-4-8",
      "amazon.nova-pro-v1:0",
      "amazon.nova-lite-v1:0",
    ],
    defaultModel: "anthropic.claude-sonnet-4-6",
  },
  {
    id: "minimax",
    name: "MiniMax",
    auth: "apiKey",
    // LOCAL/desktop only for now: the cloud per-turn sandbox egress is not
    // allowlisted for api.minimax.io.
    cloud: false,
    models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M3"],
    defaultModel: "MiniMax-M3",
  },
  {
    id: "openai-compatible",
    name: "Local model (OpenAI-compatible)",
    auth: "openaiCompatible",
    // LOCAL profile ONLY: the base URL is the user's own machine (Ollama / vLLM
    // / LM Studio), unreachable from a cloud runtime or pod. The host route gates
    // it on the deployment's `openaiCompatible` capability. The runtime owns the
    // full endpoint config (base URL + model); nothing is curated here.
    cloud: false,
  },
];

const byId = new Map(PROVIDERS.map((p) => [p.id as string, p]));

/** A provider the cloud per-turn runtime serves. */
export const CLOUD_PROVIDERS: readonly HostProvider[] = PROVIDERS.filter(
  (p) => p.cloud,
);

/** True when `id` names a known API-key provider (OpenCode Zen / Go). */
export function isApiKeyProvider(id: string): boolean {
  return byId.get(id)?.auth === "apiKey";
}

/** True when `id` is a provider the cloud per-turn runtime offers. */
export function isCloudProvider(id: string): boolean {
  return byId.get(id)?.cloud === true;
}

/** Lookup a provider by id. */
export function hostProvider(id: string): HostProvider | undefined {
  return byId.get(id);
}

/** A provider's display name, or the id itself when unknown. */
export function providerName(id: string): string {
  return byId.get(id)?.name ?? id;
}

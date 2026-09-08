import type { HostProvider } from "./types";

/**
 * Host-side provider catalog. The runtime (packages/runtime) owns the full model
 * lists; the host only needs to know which providers exist, how they authenticate,
 * and which ones the cloud per-turn runtime offers — for the api-key submit route
 * and the cloudrun providers/auth-status listing. The standing-runtime (proxy)
 * path doesn't use this: it relays the runtime's own /providers + /auth/* surface.
 */
export const PROVIDERS: readonly HostProvider[] = [
  { id: "anthropic", name: "Claude (Pro / Max)", auth: "oauth", cloud: false },
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    auth: "oauth",
    cloud: true,
  },
  // GitHub Copilot subscription (OAuth, GitHub device-code flow). `cloud: false`
  // = not wired into the legacy cloudrun per-turn path; it is served everywhere
  // else (desktop AND the managed pod, via the full pi-ai catalog). The runtime
  // serves Copilot's full model list via the standing-runtime /providers relay,
  // so no curated `models` here (same as the other OAuth providers).
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
    // `cloud: false` = off the legacy cloudrun per-turn listing only; served
    // everywhere else (desktop AND the managed pod, via the full pi-ai catalog).
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
    // `cloud: false` = off the legacy cloudrun per-turn listing only; served
    // everywhere else (desktop AND the managed pod, via the full pi-ai catalog).
    cloud: false,
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    defaultModel: "deepseek-v4-flash",
  },
  {
    id: "google",
    name: "Google Gemini",
    auth: "apiKey",
    // `cloud: false` = off the legacy cloudrun per-turn listing only; served
    // everywhere else (desktop AND the managed pod, via the full pi-ai catalog).
    cloud: false,
    models: [
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemma-4-26b-a4b-it",
      "gemma-4-31b-it",
    ],
    defaultModel: "gemini-3.8-flash",
  },
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    auth: "apiKey",
    // `cloud: false` = off the legacy cloudrun per-turn listing only; served
    // everywhere else (desktop AND the managed pod, via the full pi-ai catalog).
    cloud: false,
    // Claude ids are `global.` inference-profile ids — Bedrock serves Claude
    // 4.x only through inference profiles; bare foundation ids fail every
    // on-demand invocation (PRODUCT-1477).
    models: [
      "global.anthropic.claude-sonnet-4-6",
      "global.anthropic.claude-opus-4-8",
      "amazon.nova-pro-v1:0",
      "amazon.nova-lite-v1:0",
    ],
    defaultModel: "global.anthropic.claude-sonnet-4-6",
  },
  {
    id: "minimax",
    name: "MiniMax",
    auth: "apiKey",
    // `cloud: false` = off the legacy cloudrun per-turn listing only; served
    // everywhere else (desktop AND the managed pod, via the full pi-ai catalog).
    cloud: false,
    // `MiniMax-M3[1m]` is the subscription token/coding-plan SKU (1M context); it
    // leads because it is the connect default (HOU-1160). Bare ids stay selectable.
    models: [
      "MiniMax-M3[1m]",
      "MiniMax-M2.7",
      "MiniMax-M2.7-highspeed",
      "MiniMax-M3",
    ],
    defaultModel: "MiniMax-M3[1m]",
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

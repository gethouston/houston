/**
 * The fake host's AI-provider catalog — the static shape of each provider the
 * per-agent connect flow exposes (name, auth kind, the `LoginInfo` kind its
 * `startLogin` returns, its selectable models). The mutable per-agent
 * credential/active state lives in `state-providers.ts`; this is the fixed spine
 * it reads.
 *
 * A small but realistic set spanning both auth kinds and both hosted login kinds
 * (`auth_code` = paste-back Claude; `device_code` = Codex/Copilot), so a contract
 * test can exercise every branch. Wire types come from the real package so a
 * `ProviderId` change breaks the typecheck here instead of drifting the mock.
 */

import type { ProviderId } from "@houston/runtime-client";

export interface ProviderSpec {
  id: ProviderId;
  name: string;
  /** How the user connects: an OAuth dance or a pasted API key. */
  connect: "oauth" | "apiKey";
  /** The `LoginInfo` kind `startLogin` returns for the OAuth providers. */
  loginKind: "auth_code" | "device_code";
  models: string[];
}

export const CATALOG: ProviderSpec[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    connect: "oauth",
    loginKind: "auth_code",
    models: ["claude-sonnet-4-6", "claude-opus-4-8"],
  },
  {
    id: "openai-codex",
    name: "OpenAI (Codex)",
    connect: "oauth",
    loginKind: "device_code",
    models: ["gpt-5-codex", "o4-mini"],
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    connect: "oauth",
    loginKind: "device_code",
    models: ["gpt-4.1", "claude-sonnet-4-6"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    connect: "apiKey",
    loginKind: "device_code",
    models: ["auto", "z-ai/glm-4.6"],
  },
];

export const SPEC = new Map(CATALOG.map((s) => [s.id, s]));

import type { ProviderId } from "@houston/runtime-client";

export interface ProviderSpec {
  id: ProviderId;
  name: string;
  connect: "oauth" | "apiKey";
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
    models: ["gpt-6-luna", "claude-sonnet-5"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    connect: "apiKey",
    loginKind: "device_code",
    models: ["auto", "z-ai/glm-4.6"],
  },
];

export const SPEC: ReadonlyMap<string, ProviderSpec> = new Map(
  CATALOG.map((s) => [s.id, s]),
);

export function apiKeyProviderSpec(value: unknown): ProviderSpec | undefined {
  if (typeof value !== "string") return undefined;
  const spec = SPEC.get(value);
  return spec?.connect === "apiKey" ? spec : undefined;
}

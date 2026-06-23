import type { Agent, Workspace } from "../../../../ui/engine-client/src/types";

/**
 * The new engine is single-workspace / single-user with no agent concept, but
 * the desktop UI needs at least one Workspace + Agent to render its shell. We
 * fabricate one synthetic workspace and seed one default agent (see
 * `agents.ts`). The agent's `folderPath` doubles as the feed-store key +
 * conversation namespace.
 */
export const DEFAULT_WORKSPACE_ID = "default";
export const DEFAULT_AGENT_ID = "default-agent";
export const DEFAULT_AGENT_PATH = "houston:default-agent";
export const DEFAULT_AGENT_COLOR = "#7a5cff";
/**
 * Config id the seeded agent renders as. MUST match a real `AgentDefinition`
 * (`app/src/agents/builtin/*`) or the shell can't resolve `agentDef` and falls
 * back to its "No agents yet" empty state. The flagship non-technical experience
 * is `personal-assistant`.
 */
export const DEFAULT_AGENT_CONFIG_ID = "personal-assistant";
const EPOCH = "2024-01-01T00:00:00.000Z";

export function syntheticWorkspace(
  provider?: string,
  model?: string,
): Workspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: "Houston",
    isDefault: true,
    createdAt: EPOCH,
    locale: null,
    provider,
    model,
  };
}

export function syntheticAgent(): Agent {
  return {
    id: DEFAULT_AGENT_ID,
    name: "Houston",
    folderPath: DEFAULT_AGENT_PATH,
    configId: DEFAULT_AGENT_CONFIG_ID,
    color: DEFAULT_AGENT_COLOR,
    createdAt: EPOCH,
    lastOpenedAt: EPOCH,
  };
}

/** Old desktop provider name -> new engine ProviderId. */
export function toNewProvider(
  name: string,
):
  | "anthropic"
  | "openai-codex"
  | "github-copilot"
  | "openrouter"
  | "google"
  | "opencode"
  | "opencode-go"
  | null {
  if (name === "anthropic") return "anthropic";
  if (name === "openai" || name === "openai-codex" || name === "codex")
    return "openai-codex";
  if (name === "github-copilot") return "github-copilot";
  if (name === "openrouter") return "openrouter";
  if (name === "google") return "google";
  if (name === "opencode") return "opencode";
  if (name === "opencode-go") return "opencode-go";
  return null;
}

/**
 * New engine ProviderId -> old desktop provider name. Only Codex is renamed
 * (openai-codex -> openai); the OpenCode ids are the same on both sides.
 */
export function toOldProvider(id: string): string {
  // openrouter/google share one id across frontend and engine; only codex differs.
  return id === "openai-codex" ? "openai" : id;
}

/** The engine ProviderId values, narrowed from toNewProvider's union. */
export type NewProviderId = NonNullable<ReturnType<typeof toNewProvider>>;

/**
 * Decide the engine-settings update a per-agent config-file write implies, or
 * null to skip. The runtime resolves the model from its OWN settings
 * (activeProvider + models[provider]), but the chat model picker only writes
 * `.houston/config/config.json` — so a config write carrying provider+model
 * (+effort) must be mirrored into the runtime, or picking a non-default model
 * (e.g. an OpenCode Go model other than the default) or a reasoning effort
 * updates the doc the runtime never reads and every turn keeps running the
 * provider default. Pure so the bridge decision is unit-tested without the
 * HTTP client.
 */
export function configWriteToSettings(
  relPath: string,
  content: string,
): { activeProvider: NewProviderId; model?: string; effort?: string } | null {
  if (!relPath.endsWith(".houston/config/config.json")) return null;
  let cfg: { provider?: unknown; model?: unknown; effort?: unknown };
  try {
    cfg = JSON.parse(content) as {
      provider?: unknown;
      model?: unknown;
      effort?: unknown;
    };
  } catch {
    return null;
  }
  if (typeof cfg.provider !== "string") return null;
  const pid = toNewProvider(cfg.provider);
  if (!pid) return null;
  return {
    activeProvider: pid,
    ...(typeof cfg.model === "string" && cfg.model ? { model: cfg.model } : {}),
    ...(typeof cfg.effort === "string" && cfg.effort
      ? { effort: cfg.effort }
      : {}),
  };
}

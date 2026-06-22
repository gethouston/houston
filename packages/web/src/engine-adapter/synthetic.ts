import type { Workspace, Agent } from "../../../../ui/engine-client/src/types";

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
): "anthropic" | "openai-codex" | null {
  if (name === "anthropic") return "anthropic";
  if (name === "openai" || name === "openai-codex" || name === "codex")
    return "openai-codex";
  return null;
}

/** New engine ProviderId -> old desktop provider name. */
export function toOldProvider(id: string): string {
  return id === "openai-codex" ? "openai" : id;
}

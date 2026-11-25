import { canonicalProviderId, migrateProviderModel } from "@houston/domain";
import type { AgentColorId } from "@houston/domain/agent-color-ids";
import { toDisplayProviderId } from "@houston/domain/provider-dialect";
import type { Agent, Workspace } from "@houston/wire-types";

export const DEFAULT_WORKSPACE_ID = "default";
export const DEFAULT_AGENT_ID = "default-agent";
export const DEFAULT_AGENT_PATH = "houston:default-agent";
export const DEFAULT_AGENT_NAME = "Nova";
export const DEFAULT_AGENT_COLOR: AgentColorId = "purple";
export const DEFAULT_AGENT_CONFIG_ID = "personal-assistant";
const EPOCH = "2024-01-01T00:00:00.000Z";

export function syntheticWorkspace(): Workspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: "Personal",
    isDefault: true,
    createdAt: EPOCH,
    locale: null,
  };
}

export function syntheticAgent(): Agent {
  return {
    id: DEFAULT_AGENT_ID,
    name: DEFAULT_AGENT_NAME,
    folderPath: DEFAULT_AGENT_PATH,
    configId: DEFAULT_AGENT_CONFIG_ID,
    color: DEFAULT_AGENT_COLOR,
    createdAt: EPOCH,
    lastOpenedAt: EPOCH,
  };
}

export function toNewProvider(name: string): string | null {
  return canonicalProviderId(name);
}

export const toOldProvider = toDisplayProviderId;

export type NewProviderId = string;

const OPENCODE_GATEWAYS: readonly NewProviderId[] = ["opencode", "opencode-go"];

// WHY: OpenCode Zen and Go share one key; writes and clears go to both ids. ADR-0030
export function credentialSiblings(pid: NewProviderId): NewProviderId[] {
  return OPENCODE_GATEWAYS.includes(pid) ? [...OPENCODE_GATEWAYS] : [pid];
}

export function configWriteToSettings(
  relPath: string,
  content: string,
): { activeProvider?: string; model?: string; effort?: string } | null {
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
  const effort =
    typeof cfg.effort === "string" && cfg.effort ? { effort: cfg.effort } : {};
  if (typeof cfg.provider !== "string")
    return "effort" in effort ? effort : null;
  const { provider, model, diagnostics } = migrateProviderModel(
    cfg.provider,
    typeof cfg.model === "string" ? cfg.model : undefined,
    relPath,
  );
  for (const d of diagnostics)
    console.warn(`[engine-adapter] migrated agent model: ${d.message}`);
  return { activeProvider: provider, model, ...effort };
}

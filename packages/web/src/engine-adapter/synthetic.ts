import { migrateProviderModel } from "@houston/domain";
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
    name: "Personal",
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

/**
 * Old desktop provider name -> new engine ProviderId.
 *
 * The catalog is OPEN: the frontend hydrates its provider list from the host's
 * `/v1/catalog` (the full pi-ai set, ~35 providers), so this mapping must NOT
 * enumerate providers. Only Codex is renamed (display `openai` / legacy `codex`
 * -> engine `openai-codex`); every other id is the SAME on both sides and passes
 * through verbatim — an uncurated pi provider (groq, mistral, xai, nvidia,
 * huggingface, google-vertex, zai, ...) connects, probes, and signs out with its
 * own id, and the host/runtime remain the validity authority (their routes 400 a
 * genuinely unknown id). Returning null for anything uncurated used to hard-fail
 * `setProviderApiKey` with "provider not supported" before any network call
 * (surfaced as the generic error toast) and silently no-op status/sign-out.
 * Null only for an empty name, so `if (!pid)` guards keep rejecting it.
 */
export function toNewProvider(name: string): string | null {
  if (!name) return null;
  if (name === "openai" || name === "codex") return "openai-codex";
  return name;
}

/**
 * New engine ProviderId -> old desktop provider name. Only Codex is renamed
 * (openai-codex -> openai); the OpenCode ids are the same on both sides.
 */
export function toOldProvider(id: string): string {
  // openrouter/deepseek/google/amazon-bedrock/minimax share one id across frontend and engine;
  // only codex differs.
  return id === "openai-codex" ? "openai" : id;
}

/**
 * An engine ProviderId in the adapter's dialect: any pi-ai provider id (the
 * catalog is open), post-rename (openai -> openai-codex).
 */
export type NewProviderId = string;

/**
 * OpenCode's two gateways — `opencode` (Zen, pay-as-you-go) and `opencode-go`
 * (Go, $10/mo subscription) — share ONE opencode.ai key: pi reads
 * `OPENCODE_API_KEY` for both. Houston connects them as a single "OpenCode"
 * account, so a credential write or clear must fan out to both ids. Keep in sync
 * with the frontend's merged connect card (`getConnectProviders` gatewayIds).
 */
const OPENCODE_GATEWAYS: readonly NewProviderId[] = ["opencode", "opencode-go"];

/**
 * Every gateway id a credential write / clear for `pid` must touch. Just `[pid]`
 * for every provider except the two OpenCode gateways, which share a key — so
 * connecting (or signing out of) either writes (or clears) both.
 */
export function credentialSiblings(pid: NewProviderId): NewProviderId[] {
  return OPENCODE_GATEWAYS.includes(pid) ? [...OPENCODE_GATEWAYS] : [pid];
}

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
): { activeProvider: string; model?: string; effort?: string } | null {
  // `activeProvider` is whatever `migrateProviderModel` yields — since the wire
  // ProviderId now accepts any pi-ai id, a genuinely new provider passes through
  // as a plain string rather than being narrowed to the known `NewProviderId`.
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
  // Migrate legacy provider+model ids to ones pi-ai accepts BEFORE seeding the
  // runtime's settings. The runtime's getModel(provider, id) throws for an id it
  // doesn't offer (the legacy "openai" provider, bare "opus"/"sonnet", CLI-era
  // model ids), which would hard-fail the agent's first turn. migrateProviderModel
  // is pure + fail-soft: an unknown value lands on the provider/model default and
  // records a diagnostic rather than letting a bad id reach the runtime.
  const { provider, model, diagnostics } = migrateProviderModel(
    cfg.provider,
    typeof cfg.model === "string" ? cfg.model : undefined,
    relPath,
  );
  for (const d of diagnostics)
    console.warn(`[engine-adapter] migrated agent model: ${d.message}`);
  return {
    activeProvider: provider,
    model,
    ...(typeof cfg.effort === "string" && cfg.effort
      ? { effort: cfg.effort }
      : {}),
  };
}

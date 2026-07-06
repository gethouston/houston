import {
  canonicalModelId,
  canonicalProviderId,
  migrateProviderModel,
} from "@houston/domain";
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
  | "deepseek"
  | "google"
  | "amazon-bedrock"
  | "minimax"
  | "opencode"
  | "opencode-go"
  | "openai-compatible"
  | null {
  if (name === "anthropic") return "anthropic";
  if (name === "openai" || name === "openai-codex" || name === "codex")
    return "openai-codex";
  if (name === "github-copilot") return "github-copilot";
  if (name === "openrouter") return "openrouter";
  if (name === "deepseek") return "deepseek";
  if (name === "google") return "google";
  if (name === "amazon-bedrock") return "amazon-bedrock";
  if (name === "minimax") return "minimax";
  if (name === "opencode") return "opencode";
  if (name === "opencode-go") return "opencode-go";
  // Local OpenAI-compatible server — same id on both sides.
  if (name === "openai-compatible") return "openai-compatible";
  return null;
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

/** The engine ProviderId values, narrowed from toNewProvider's union. */
export type NewProviderId = NonNullable<ReturnType<typeof toNewProvider>>;

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
 * Map a send's app-dialect provider/model/effort overrides to the per-turn
 * WIRE pin (engine ids) — pure, so the send-time mapping is unit-tested
 * without the HTTP client. This is what keeps every conversation on ITS OWN
 * picked provider (HOU-695): the composer forwards the chat's effective
 * provider/model on each send, and the runtime runs the turn on exactly that
 * pin instead of falling back to the agent-wide settings.
 *
 * Fail-soft — never a hard turn failure, and never a pin the user can't see:
 * - an unknown provider string drops the whole provider/model pin (the runtime
 *   resolves as before and surfaces its own cards) with a console diagnostic;
 * - a model the mapped provider doesn't own drops just the model (the turn
 *   runs the provider's default) with a diagnostic — an unknown PINNED model
 *   id would hard-fail the turn (the runtime validates pins strictly);
 * - a model with no provider can't be ownership-checked, so it is dropped too;
 * - effort passes through verbatim; an effort-only send still pins it.
 */
export function wireTurnPin(req: {
  provider?: string;
  model?: string;
  effort?: string;
}): { provider?: string; model?: string; effort?: string } | undefined {
  const pin: { provider?: string; model?: string; effort?: string } = {};
  if (req.provider) {
    const provider = canonicalProviderId(req.provider);
    if (provider) {
      pin.provider = provider;
      if (req.model) {
        const model = canonicalModelId(provider, req.model);
        if (model) pin.model = model;
        else
          console.warn(
            `[engine-adapter] "${req.model}" is not a known ${provider} model; pinning the provider only`,
          );
      }
    } else {
      console.warn(
        `[engine-adapter] unknown provider "${req.provider}"; the turn uses the engine's own resolution`,
      );
    }
  } else if (req.model) {
    console.warn(
      `[engine-adapter] model "${req.model}" sent without a provider; the turn uses the engine's own resolution`,
    );
  }
  if (req.effort) pin.effort = req.effort;
  return pin.provider || pin.effort ? pin : undefined;
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

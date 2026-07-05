import { resolveModel } from "../ai/providers";
import { authStorage, modelRegistry } from "../auth/storage";
import { createClaudeBackend } from "../backends/claude/backend";
import { readAnthropicToken } from "../backends/claude/read-token";
import { createPiBackend } from "../backends/pi/backend";
import {
  backendFor,
  registerBackend,
  setDefaultBackend,
} from "../backends/registry";
import type { HarnessSession, ResolvedModel } from "../backends/types";
import { config } from "../config";
import type { TurnPin } from "./exec-turn";
import { SYSTEM_PROMPT } from "./resource-loader";
import { buildToolSelection } from "./tool-selection";
import { makeClampedFileTools } from "./tools/clamped-fs";
import { makeIdTokenProvider } from "./tools/gcp-id-token";
import { makeIntegrationTools } from "./tools/integrations";
import { makeRunCodeTool } from "./tools/run-code";

/**
 * The long-lived server's per-conversation session cache: the tool wiring shared
 * by every session, the Conversation record (session + turn queue + the tracked
 * provider/model + the executing turn's id), and the lazy build/rehydrate. Turn
 * execution runs the session behind the HarnessBackend seam (backends/) — pi is
 * the default backend, built once here from the module-level deps. Turn logic
 * lives in exec-turn.ts; the public turn API (run/cancel/dispose) in chat.ts.
 */

// Workspace-clamped file tools (security Gate #1). These shadow pi's builtins
// by name: pi's defaults resolve absolute paths as-is, so without the clamp a
// prompt-injected agent could read /etc/passwd or its own auth.json with no
// bash tool. See tools/clamped-fs.ts.
const fileTools = makeClampedFileTools(config.workspaceDir);

// Integration tools (Composio, platform mode): available whenever this runtime
// can reach its host with a sandbox token (server mode — local desktop +
// standing pods). They hold no credential; they proxy to /sandbox/integrations
// and the host (or its cloud gateway) acts as the user's Composio user_id.
const integrationTools =
  config.controlPlaneUrl && config.sandboxToken
    ? makeIntegrationTools({
        baseUrl: config.controlPlaneUrl,
        sandboxToken: config.sandboxToken,
      })
    : [];

const toolSelection = buildToolSelection({
  codeExecution: config.codeExecution,
  integrations: integrationTools.length > 0,
});
const runCodeTool = toolSelection.includeRunCode
  ? makeRunCodeTool({
      baseUrl: config.codeSandboxUrl,
      token: config.codeSandboxToken,
      workspaceDir: config.workspaceDir,
      limits: {
        maxConcurrent: config.runCodeMaxConcurrent,
        maxPerMinute: config.runCodePerMinute,
      },
      idToken: makeIdTokenProvider(config.codeSandboxUrl),
    })
  : null;

/**
 * The default backend for this process: pi, wired to the module-level workspace,
 * credentials, and tool selection. Registered as the fallback so every provider
 * resolves to it until a provider ships its own harness.
 */
const piBackend = createPiBackend({
  workspaceDir: config.workspaceDir,
  dataDir: config.dataDir,
  authStorage,
  modelRegistry,
  tools: toolSelection.toolNames,
  customTools: [
    ...fileTools,
    ...(runCodeTool ? [runCodeTool] : []),
    ...integrationTools,
  ],
});
setDefaultBackend(piBackend);

/**
 * COMPLIANCE GATE: the `anthropic` provider runs its turns through the Claude
 * Agent SDK backend — `createClaudeBackend` → the real `claude` subprocess with
 * the token in `options.env` — NOT pi's in-process Anthropic client. pi-ai
 * hitting api.anthropic.com with a setup token + hand-set Claude Code beta
 * headers is exactly the harness-spoofing Anthropic server-blocks, so this
 * registration reroutes anthropic OFF the pi default above. Every other provider
 * still resolves to the pi backend. It reuses the SAME `toolSelection` the pi
 * path computed (so Bash gating / run-code stay identical) and Houston's product
 * system prompt (full-replace, never the SDK's claude_code preset).
 *
 * Server-mode only: the per-request cloud runtime (turn/) builds its own pi
 * backend per turn and never imports this module, so cloud anthropic stays OFF.
 */
registerBackend(
  "anthropic",
  createClaudeBackend({
    workspaceDir: config.workspaceDir,
    dataDir: config.dataDir,
    readToken: () => readAnthropicToken(authStorage),
    toolSelection,
    systemPrompt: config.systemPrompt || SYSTEM_PROMPT,
  }),
);

export type Conversation = {
  session: HarnessSession;
  queue: Promise<unknown>;
  /**
   * The provider/model the live session is currently pointed at. Tracked so a
   * real mid-conversation switch can be detected — on the web the picker applies
   * a switch via `setSettings`, which alone does NOT move the cached session.
   */
  provider: string;
  model: string;
  /**
   * The id of the backend that BUILT the live session (pi by default, `anthropic`
   * for the Claude Agent SDK). A mid-conversation provider switch that crosses a
   * backend boundary must REBUILD the session on the new backend — never forward
   * a foreign model into the live one via `setModel` (that would route an
   * anthropic turn through pi's in-process client, or an openai id through the
   * Claude subprocess). Compared against `backendFor(model.provider).id` each turn.
   */
  backendId: string;
  /**
   * The wire id of the turn EXECUTING right now (undefined between turns).
   * cancelTurn stamps it on the "Stopped by user" terminal frame so the stop
   * settles the turn it actually interrupts, not whatever a client guesses.
   */
  turnId?: string;
};

/** Live sessions by conversation id (module state — one workspace per process). */
export const conversations = new Map<string, Conversation>();

export async function getConversation(
  id: string,
  pin?: TurnPin,
): Promise<Conversation> {
  const existing = conversations.get(id);
  if (existing) return existing;

  // The model the session is built with — recorded on the Conversation so a
  // later turn can detect when the active provider/model changed under it.
  // A routine's pin builds the session directly on ITS provider/model, so a
  // pinned routine works even when the agent's saved provider is logged out.
  const builtModel = resolveModel(pin?.model, pin?.provider);
  // Resolve the provider's backend (pi by default) and open the conversation's
  // session through it. The backend rehydrates prior turns from disk when the
  // conversation already exists — see createPiBackend.
  const backend = backendFor(builtModel.provider);
  const session = await backend.createSession({
    conversationId: id,
    model: builtModel,
  });

  const conv: Conversation = {
    session,
    queue: Promise.resolve(),
    provider: builtModel.provider,
    model: builtModel.id,
    backendId: backend.id,
  };
  conversations.set(id, conv);
  return conv;
}

/**
 * COMPLIANCE GATE: ensure a conversation's live session sits on the backend the
 * resolved model requires, REBUILDING it when a mid-conversation switch crosses a
 * backend boundary (e.g. openai/pi → anthropic/Claude SDK, or the reverse).
 *
 * A foreign model must NEVER be `setModel`'d into the live session — that would
 * forward an anthropic model into pi's in-process Anthropic client (the
 * harness-spoofing request Anthropic blocks) or an openai id through the Claude
 * subprocess. So the old session is disposed and a fresh one opened via the
 * correct backend. The new backend starts WITHOUT the old in-memory history —
 * each backend owns its own session store and the Houston transcript is the UI
 * source of truth, so history is not (and cannot be) replayed across backends.
 *
 * A same-backend change (pi sonnet→opus, or claude model→model) is left alone —
 * the caller keeps the cheap `setModel` fast path that preserves the live session.
 *
 * Returns `rebuilt: true` with the leaving session's last context fill (for the
 * `provider_switched` frame) when it rebuilt, else `rebuilt: false`.
 */
export async function switchBackendIfNeeded(
  conv: Conversation,
  conversationId: string,
  model: ResolvedModel,
): Promise<{ rebuilt: boolean; preTokens: number | null }> {
  const backend = backendFor(model.provider);
  if (backend.id === conv.backendId) return { rebuilt: false, preTokens: null };

  // Capture the leaving provider's context fill BEFORE tearing the session down,
  // so the switch can still be sized against the new model's window downstream.
  const preTokens = conv.session.getContextUsage()?.tokens ?? null;
  conv.session.dispose();
  conv.session = await backend.createSession({
    conversationId,
    model,
  });
  conv.backendId = backend.id;
  conv.provider = model.provider;
  conv.model = model.id;
  return { rebuilt: true, preTokens };
}

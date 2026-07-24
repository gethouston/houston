import { DEFAULT_TURN_MODE, type TurnMode } from "@houston/protocol";
import { resolveModel } from "../ai/providers";
import { authStorage, modelRuntime } from "../auth/storage";
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
import { LruCache } from "../lru";
import type { TurnPin } from "./exec-turn";
import { SYSTEM_PROMPT } from "./resource-loader";
import { buildToolSelection } from "./tool-selection";
import { makeAskUserTool } from "./tools/ask-user";
import { makeClampedFileTools } from "./tools/clamped-fs";
import { makeCustomIntegrationTools } from "./tools/custom-integrations";
import { makeIdTokenProvider } from "./tools/gcp-id-token";
import { makeIntegrationTools } from "./tools/integrations";
import { makePlanReadyTool } from "./tools/plan-ready";
import { makeRunCodeTool } from "./tools/run-code";
import { makeSaveRoutineTool } from "./tools/save-routine";
import { makeSuggestReusableTool } from "./tools/suggest-reusable";
import type { TurnModeRef } from "./turn-mode-context";
import type { ProvidedContext } from "./workspace-context";

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

// The blocking-question tool: available in EVERY mode (holds no credential,
// makes no network call). Records the turn's pending question so it rides the
// terminal `done` frame and Houston renders it as a card in place of the input.
const askUserTool = makeAskUserTool();

// The plan-presentation tool: registered always, name-gated to Plan mode by
// `toolNamesForMode` (harmless in execute/auto — pi only exposes it when its
// name is in the mode's allowlist). Records the turn's plan-ready step so it
// rides the terminal `done` frame as a plan-approval card.
const planReadyTool = makePlanReadyTool();

// The reusable-suggestion tool: registered always, reaches execute/auto via the
// tool-selection allowlist and is filtered out of plan by name (`toolNamesForMode`).
// Records the turn's suggest-reusable step so a clean finish can ride the terminal
// `done` frame as a dismissible save-as-Skill/Routine card, without flipping the
// board to `needs_you`.
const suggestReusableTool = makeSuggestReusableTool();

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

// Custom-integration setup tools (HOU-550): same reachability gate and trust
// posture — they proxy to /sandbox/integrations/custom/* and hold no secret.
const customIntegrationTools =
  config.controlPlaneUrl && config.sandboxToken
    ? makeCustomIntegrationTools({
        baseUrl: config.controlPlaneUrl,
        sandboxToken: config.sandboxToken,
      })
    : [];

// Whether this runtime can reach its host with a sandbox token (server mode:
// local desktop + standing pods). Gates the host-proxying tools below.
const hostReachable = Boolean(config.controlPlaneUrl && config.sandboxToken);

// The merge-safe scheduled-task write tool: proxies to /sandbox/routines/save so
// the agent never overwrites routines.json wholesale. Same reachability gate as
// the integration tools, but NOT tied to a Composio key — scheduled tasks exist
// on every deployment.
const saveRoutineTool = hostReachable
  ? makeSaveRoutineTool({
      baseUrl: config.controlPlaneUrl,
      sandboxToken: config.sandboxToken,
    })
  : null;

const toolSelection = buildToolSelection({
  codeExecution: config.codeExecution,
  integrations: integrationTools.length > 0,
  saveRoutine: hostReachable,
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
  modelRuntime,
  tools: toolSelection.toolNames,
  customTools: [
    ...fileTools,
    askUserTool,
    planReadyTool,
    suggestReusableTool,
    ...(runCodeTool ? [runCodeTool] : []),
    ...(saveRoutineTool ? [saveRoutineTool] : []),
    ...integrationTools,
    ...customIntegrationTools,
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
    // SAME integrations gate as the pi path above: present only when this
    // runtime can reach its host with a sandbox token, so the Claude backend's
    // in-process MCP server exposes the identical integration tool set.
    integrations:
      config.controlPlaneUrl && config.sandboxToken
        ? {
            baseUrl: config.controlPlaneUrl,
            sandboxToken: config.sandboxToken,
          }
        : undefined,
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
   * The execution mode the live session was built with ("execute" by default,
   * "plan" for a read-only planning session). A per-turn mode flip that differs
   * from this REBUILDS the session on the same backend — plan and execute need
   * different tool allowlists + system prompts, which are fixed at build time.
   * See `switchModeIfNeeded`.
   */
  mode: TurnMode;
  /**
   * The EXECUTING turn's live-mode ref (set by exec-turn for the turn's
   * duration, cleared when it settles). `POST /conversations/:id/mode` mutates
   * `liveMode.current` so the running turn's tools adopt the user's mid-turn
   * Mode-pill switch at their next decision — Claude Code's shift+tab
   * semantics. Undefined between turns: with no turn running there is nothing
   * to apply live; the next turn's pin carries the mode instead.
   */
  liveMode?: TurnModeRef;
  /**
   * The workspace + user context the session was FIRST built with (HOU-711,
   * cloud). Reused verbatim when a mode/backend switch rebuilds the session, so a
   * conversation keeps its startup context across a plan ⇄ execute flip — matching
   * how it keeps its history; a context edit only lands in a NEW conversation.
   */
  context?: ProvidedContext;
  /**
   * The wire id of the turn EXECUTING right now (undefined between turns).
   * cancelTurn stamps it on the "Stopped by user" terminal frame so the stop
   * settles the turn it actually interrupts, not whatever a client guesses.
   */
  turnId?: string;
  /**
   * The wire id of a turn the user STOPPED (set by `cancelTurn` when it aborts a
   * live turn; read + cleared by `execTurn` after `prompt()` resolves). pi routes
   * an aborted turn down the normal usage path — `prompt()` resolves clean with
   * no provider_error — so this marker is the only trace that the resolution was
   * a stop. execTurn uses it to stamp `stopped: true` on the persisted assistant
   * message (so the stop survives a reload) and to skip the clean `done`.
   */
  stoppedTurnId?: string;
  /**
   * Turns queued-or-running for this conversation (incremented for a turn's
   * whole lifetime by chat.ts `runTurn`, decremented when it settles). `> 0`
   * pins the session against idle/LRU eviction so a session is NEVER disposed
   * from under a queued turn — `turnId` alone would miss a turn parked in the
   * queue behind the workdir lock, whose session is not yet executing.
   */
  pending: number;
};

/**
 * A session cannot be evicted while it has a turn queued or executing — disposing
 * it mid-turn would abort work the user is waiting on. Both signals are checked:
 * `turnId` covers the executing turn, `pending` covers turns still queued.
 */
const isConvBusy = (conv: Conversation): boolean =>
  (conv.pending ?? 0) > 0 || conv.turnId !== undefined;

/**
 * Live sessions by conversation id (module state — one workspace per process),
 * LRU-bounded + idle-expiring so a long-lived runtime's memory tracks its ACTIVE
 * conversations, not every one ever opened. An evicted session is disposed and
 * transparently re-hydrated from its on-disk transcript on next access — behavior
 * is preserved; only idle, turn-free sessions are ever evicted (see isConvBusy).
 */
export const conversations = new LruCache<string, Conversation>({
  capacity: config.sessionCacheMax,
  idleMs: config.sessionCacheIdleMs > 0 ? config.sessionCacheIdleMs : undefined,
  isPinned: (_id, conv) => isConvBusy(conv),
  onEvict: (_id, conv) => conv.session.dispose(),
});

export async function getConversation(
  id: string,
  pin?: TurnPin,
  context?: ProvidedContext,
): Promise<Conversation> {
  const existing = conversations.get(id);
  if (existing) {
    // Reap sessions idle past the TTL on every access, so a quiet runtime still
    // sheds memory between turns (get() above already marked `existing` fresh).
    conversations.sweepIdle();
    return existing;
  }

  // The model the session is built with — recorded on the Conversation so a
  // later turn can detect when the active provider/model changed under it.
  // A routine's pin builds the session directly on ITS provider/model, so a
  // pinned routine works even when the agent's saved provider is logged out.
  const builtModel = resolveModel(pin?.model, pin?.provider);
  // Resolve the provider's backend (pi by default) and open the conversation's
  // session through it. The backend rehydrates prior turns from disk when the
  // conversation already exists — see createPiBackend.
  const backend = backendFor(builtModel.provider);
  // The first turn's mode fixes how the session is built (read-only + planning
  // overlay for "plan"). A later flip rebuilds via `switchModeIfNeeded`.
  const mode = pin?.mode ?? DEFAULT_TURN_MODE;
  const session = await backend.createSession({
    conversationId: id,
    model: builtModel,
    mode,
    // Only used when the session is FIRST built (new conversation) — a later
    // message in the same conversation reuses this session, so context edits
    // take effect on the next chat, matching the local file behavior (HOU-711).
    ...(context ? { context } : {}),
  });

  const conv: Conversation = {
    session,
    queue: Promise.resolve(),
    provider: builtModel.provider,
    model: builtModel.id,
    backendId: backend.id,
    mode,
    pending: 0,
    ...(context ? { context } : {}),
  };
  // set() enforces the size bound (disposing the LRU tail if full); sweepIdle()
  // then reaps any TTL-expired idle session. Both skip busy sessions, and the
  // just-built `conv` is the most-recent entry, so it is never the one evicted.
  conversations.set(id, conv);
  conversations.sweepIdle();
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
  mode: TurnMode,
): Promise<{ rebuilt: boolean; preTokens: number | null }> {
  const backend = backendFor(model.provider);
  if (backend.id === conv.backendId) return { rebuilt: false, preTokens: null };

  // Capture the leaving provider's context fill BEFORE tearing the session down,
  // so the switch can still be sized against the new model's window downstream.
  const preTokens = conv.session.getContextUsage()?.tokens ?? null;
  conv.session.dispose();
  // Build the new backend's session directly at the requested mode, so a switch
  // that ALSO flips mode lands on it in ONE rebuild — `switchModeIfNeeded` then
  // no-ops (conv.mode is already the requested mode).
  conv.session = await backend.createSession({
    conversationId,
    model,
    mode,
    // Preserve the conversation's startup context across the rebuild (HOU-711).
    ...(conv.context ? { context: conv.context } : {}),
  });
  conv.backendId = backend.id;
  conv.provider = model.provider;
  conv.model = model.id;
  conv.mode = mode;
  return { rebuilt: true, preTokens };
}

/**
 * Ensure the live session sits in the requested execution mode, REBUILDING it on
 * the SAME backend when the mode flips (execute ⇄ plan). Plan and execute differ
 * in the tool allowlist AND the system prompt — both fixed at session-build time
 * — so a flip cannot be applied to a live session; it is rebuilt.
 *
 * History is NOT lost across the rebuild: the backend reopens THIS conversation's
 * persisted session by id (pi via `SessionManager.continueRecent` on the
 * conversation's dedicated sessions dir; Claude via its `sessions.json` +
 * transcript store keyed by conversationId), so prior turns rehydrate into the
 * fresh session. Nothing is cleared here.
 *
 * A mode flip is INTERNAL — same provider, same model — so it emits NO
 * `provider_switched` frame (unlike a cross-backend switch). No-op when the mode
 * is unchanged, so the common execute→execute turn keeps the live session.
 */
export async function switchModeIfNeeded(
  conv: Conversation,
  conversationId: string,
  model: ResolvedModel,
  mode: TurnMode,
): Promise<{ rebuilt: boolean }> {
  if (conv.mode === mode) return { rebuilt: false };
  conv.session.dispose();
  conv.session = await backendFor(model.provider).createSession({
    conversationId,
    model,
    mode,
    // Preserve the conversation's startup context across the rebuild (HOU-711).
    ...(conv.context ? { context: conv.context } : {}),
  });
  conv.mode = mode;
  return { rebuilt: true };
}

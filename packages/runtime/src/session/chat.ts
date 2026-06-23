import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
  ChatMessage,
  ProviderError,
  TokenUsage,
  ToolCallRecord,
} from "@houston/runtime-client";
import { DEFAULT_REASONING_EFFORT, toThinkingLevel } from "../ai/effort";
import { activeEffort, activeProvider, resolveModel } from "../ai/providers";
import { syncServedCredential } from "../auth/serve";
import { authStorage, modelRegistry } from "../auth/storage";
import { config } from "../config";
import {
  appendAssistantMessage,
  appendUserMessage,
} from "../store/conversations";
import { publish } from "./bus";
import { makeAgentLoader } from "./resource-loader";
import {
  CLAMPED_FILE_TOOL_NAMES,
  makeClampedFileTools,
} from "./tools/clamped-fs";
import { makeIdTokenProvider } from "./tools/gcp-id-token";
import {
  INTEGRATION_TOOL_NAMES,
  makeIntegrationTools,
} from "./tools/integrations";
import { makeRunCodeTool } from "./tools/run-code";
import { toWire } from "./wire";

// Workspace-clamped file tools (security Gate #1). These shadow pi's builtins
// by name: pi's defaults resolve absolute paths as-is, so without the clamp a
// prompt-injected agent could read /etc/passwd or its own auth.json with no
// bash tool. See tools/clamped-fs.ts.
const FILE_TOOLS = [...CLAMPED_FILE_TOOL_NAMES];
const fileTools = makeClampedFileTools(config.workspaceDir);

// The code-execution split. When a remote sandbox is configured (cloud), the
// agent runs code THERE via `run_code` and we drop the local `bash` tool — the
// agent process stays cheap and untrusted code executes in a disposable box.
// With no sandbox configured (desktop), pi keeps its in-process `bash`.
const useRemoteSandbox = !!config.codeSandboxUrl;
const runCodeTool = useRemoteSandbox
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

// Integration tools (Composio "for you"): available whenever this runtime can
// reach its host with a sandbox token (server mode — local desktop + standing
// pods). They hold no credential; they proxy to /sandbox/integrations and the
// host uses the user's own connected account.
const integrationTools =
  config.controlPlaneUrl && config.sandboxToken
    ? makeIntegrationTools({
        baseUrl: config.controlPlaneUrl,
        sandboxToken: config.sandboxToken,
      })
    : [];

// pi filters ALL tools (built-in and custom) against this name allowlist. A
// built-in like `bash` needs only its name here; a custom tool like `run_code`
// needs BOTH its name here AND its object in `customTools` (below) — omit either
// and pi filters it out. This is the pi SDK's design, not accidental duplication.
const TOOLS = [
  ...(useRemoteSandbox ? [...FILE_TOOLS, "run_code"] : [...FILE_TOOLS, "bash"]),
  ...(integrationTools.length ? INTEGRATION_TOOL_NAMES : []),
];

/**
 * Headroom kept free when deciding whether the prior conversation can be carried
 * VERBATIM into the new provider on a mid-session switch. If the leaving
 * provider's last context fill is under this fraction of the new model's window,
 * replay it as-is; at/above, compact it to fit first. Mirrors the frontend's
 * REPLAY_FIT_FRACTION in `app/src/lib/provider-switch.ts`.
 */
const REPLAY_FIT_FRACTION = 0.8;

/**
 * Whether a mid-session PROVIDER switch must compact prior context to fit the
 * new model's window before continuing. `preTokens` is the leaving provider's
 * last context fill; `null` (never reported) is treated as "no proof it won't
 * fit", so we replay rather than spend a summarizer call. At/under the fit
 * fraction -> replay; over it -> compact. Pure, so the threshold is unit-tested
 * without a live pi session.
 */
export function switchNeedsCompaction(
  preTokens: number | null,
  targetWindow: number,
): boolean {
  return preTokens != null && preTokens > targetWindow * REPLAY_FIT_FRACTION;
}

type Conversation = {
  session: AgentSession;
  queue: Promise<unknown>;
  /**
   * The provider/model the live session is currently pointed at. Tracked so a
   * real mid-conversation switch can be detected — on the web the picker applies
   * a switch via `setSettings`, which alone does NOT move the cached session.
   */
  provider: string;
  model: string;
};
const conversations = new Map<string, Conversation>();

const errMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

async function getConversation(id: string): Promise<Conversation> {
  const existing = conversations.get(id);
  if (existing) return existing;

  const loader = makeAgentLoader(config.workspaceDir);
  await loader.reload();

  // Continue this conversation's pi session if one is already on disk, else start
  // fresh. `create()` would mint a brand-new empty session every time, so a fresh
  // process (runtime restart, or a cloud sandbox woken from sleep) would silently
  // lose all prior turns. `continueRecent()` reopens the most recent session in
  // this conversation's dedicated dir, and createAgentSession rehydrates the
  // agent's message history from it (see SDK: hasExistingSession → agent.state.messages).
  const sessionManager = SessionManager.continueRecent(
    config.workspaceDir,
    join(config.dataDir, "sessions", id),
  );

  // The model the session is built with — recorded on the Conversation so a
  // later turn can detect when the active provider/model changed under it.
  const builtModel = resolveModel();
  const { session } = await createAgentSession({
    cwd: config.workspaceDir,
    agentDir: config.dataDir,
    model: builtModel, // active provider's model (Claude or Codex)
    authStorage,
    modelRegistry,
    sessionManager,
    resourceLoader: loader,
    tools: TOOLS,
    customTools: [
      ...fileTools,
      ...(runCodeTool ? [runCodeTool] : []),
      ...integrationTools,
    ],
  });

  const conv: Conversation = {
    session,
    queue: Promise.resolve(),
    provider: builtModel.provider,
    model: builtModel.id,
  };
  conversations.set(id, conv);
  return conv;
}

/** A routine's pinned model/effort for this turn. Absent = keep the session's current. */
export interface TurnPin {
  model?: string | null;
  effort?: string | null;
}

/**
 * Execute one turn: record the user + assistant messages durably and publish
 * every event to the conversation's bus. Self-contained: any failure is published
 * as an `error` event and never rethrown, so the per-conversation queue survives.
 */
async function execTurn(
  conv: Conversation,
  id: string,
  text: string,
  nonce?: string,
  pin?: TurnPin,
) {
  appendUserMessage(id, text);
  publish(id, { type: "user", data: { content: text, ts: Date.now(), nonce } });

  let assistantText = "";
  let usage: TokenUsage | null = null;
  const tools: ToolCallRecord[] = [];
  // A typed provider failure for this turn (pi resolves the turn rather than
  // throwing, so this arrives on the stream, not via the catch). Captured here
  // and persisted on the assistant message so the inline card survives a reload.
  let providerError: ProviderError | undefined;

  const unsub = conv.session.subscribe((e: AgentSessionEvent) => {
    const wire = toWire(e);
    if (!wire) return;
    if (wire.type === "text") assistantText += wire.data;
    else if (wire.type === "usage") usage = wire.data;
    else if (wire.type === "tool_start") tools.push({ name: wire.data.name });
    else if (wire.type === "tool_end") {
      const t = tools[tools.length - 1];
      if (t) t.isError = wire.data.isError;
    } else if (wire.type === "provider_error") providerError = wire.data;
    publish(id, wire);
  });

  // Set inside the try when this turn crosses a provider boundary; declared out
  // here so the error path can still persist the marker on the partial message.
  let providerSwitch: ChatMessage["providerSwitch"];
  try {
    // Resolve the model for THIS turn from current settings (a routine pin wins,
    // else the workspace's active provider/model). Re-resolved every turn so a
    // mid-conversation provider/model switch — which the web picker applies via
    // setSettings, NOT a per-turn field — actually takes effect on the cached
    // session instead of silently continuing on the model it was built with.
    // A bad model id throws here → surfaces as the turn's error event.
    const model = resolveModel(pin?.model);
    const providerChanged = model.provider !== conv.provider;
    const modelChanged = model.id !== conv.model;
    if (providerChanged || modelChanged) {
      // The leaving provider's last context fill, captured BEFORE the switch so
      // a PROVIDER change can be sized against the new model's window.
      const preTokens = providerChanged
        ? (conv.session.getContextUsage()?.tokens ?? null)
        : null;
      // Re-point the live session; pi keeps the full message history and swaps
      // only the model (cross-provider works — the Model carries its provider).
      await conv.session.setModel(model);
      if (providerChanged) {
        // Mid-session PROVIDER switch. Carry the conversation verbatim when it
        // comfortably fits the new model's window (replay); otherwise compact it
        // first so it fits — pi summarizes with the now-active target model.
        let summarized = false;
        if (switchNeedsCompaction(preTokens, model.contextWindow)) {
          await conv.session.compact();
          summarized = true;
        }
        providerSwitch = {
          provider: model.provider,
          summarized,
          pre_tokens: preTokens,
        };
        // Stream the boundary so the chat draws a divider + resets its window
        // estimate; persisted on the assistant message below for reload replay.
        publish(id, { type: "provider_switched", data: providerSwitch });
      }
      conv.provider = model.provider;
      conv.model = model.id;
    }
    // Effort: the routine's pin wins, else the agent's saved setting; if neither
    // is set and the model can reason, default to medium so a reasoning model
    // (e.g. an OpenCode toggle model) actually thinks — pi only enables reasoning
    // when a level is set. Applied EVERY turn so picker changes take effect on the
    // next message. pi clamps the level to the active model.
    const reasons = (model as { reasoning?: boolean }).reasoning === true;
    const effort =
      pin?.effort ??
      activeEffort() ??
      (reasons ? DEFAULT_REASONING_EFFORT : undefined);
    if (effort) {
      const level = toThinkingLevel(effort);
      if (level) conv.session.setThinkingLevel(level);
    }
    await conv.session.prompt(text);
    // Persist the switch marker AND any typed provider error on this turn's
    // assistant message so both the boundary divider and the reconnect /
    // rate-limit card survive a history reload. A provider failure lands HERE
    // (pi resolves the turn) with empty text, not in the catch below.
    appendAssistantMessage(
      id,
      assistantText,
      tools,
      usage,
      providerSwitch,
      providerError,
    );
    publish(id, { type: "done", data: null });
  } catch (err) {
    if (assistantText)
      appendAssistantMessage(
        id,
        assistantText,
        tools,
        usage,
        providerSwitch,
        providerError,
      );
    publish(id, { type: "error", data: { message: errMessage(err) } });
  } finally {
    unsub();
  }
}

/**
 * Start a turn for a conversation. Fire-and-forget from the caller's view: events
 * are delivered over the conversation's event bus (`GET /conversations/:id/events`),
 * NOT on the request that triggered the turn. Turns on the same conversation are
 * serialized (ordered resume). Never rejects — failures surface as `error` events.
 */
/**
 * Sync the workspace's central credential, then report the connected provider (or
 * null). The message route AWAITS this before accepting a turn, so a logged-out /
 * never-connected turn fails the REQUEST — the client surfaces the error at once —
 * instead of starting a fire-and-forget turn whose only failure signal is an
 * `error` event that can race the client's SSE subscribe and get lost, leaving the
 * chat spinning forever after logout.
 */
export async function ensureProviderForTurn(): Promise<string | null> {
  // Connect-once: pull the workspace's current central credential into auth.json
  // so pi uses the user's own token. Best-effort — a transient failure leaves the
  // existing (still-valid) credential; a forgotten connection => activeProvider null.
  try {
    await syncServedCredential();
  } catch (err) {
    console.error("[serve] credential sync failed:", errMessage(err));
  }
  const provider = activeProvider();
  // Ground-truth diagnostic: the provider + model + the model's actual API base
  // URL this turn will run against. baseUrl is unambiguous — opencode.ai/zen/go/v1
  // is OpenCode Go, openai/chatgpt is Codex — unlike asking the model itself,
  // which open models (GLM/Kimi/…) routinely get wrong.
  if (provider) {
    try {
      const m = resolveModel() as { id?: string; baseUrl?: string };
      console.log(
        `[turn] provider=${provider} model=${m.id} baseUrl=${m.baseUrl}`,
      );
    } catch {
      /* resolveModel can throw on a bad pin; the turn surfaces it as an error */
    }
  }
  return provider;
}

export async function runTurn(
  id: string,
  text: string,
  nonce?: string,
  pin?: TurnPin,
): Promise<void> {
  // The message route already synced the credential and confirmed a provider via
  // ensureProviderForTurn. Re-check here as a cheap guard for the narrow window
  // where the provider is logged out mid-turn: getConversation returns a CACHED
  // session without re-running resolveModel()'s connect guard, so without this a
  // now-credential-less turn could still reach session.prompt() and hang with no
  // terminal event.
  if (!activeProvider()) {
    publish(id, {
      type: "error",
      data: { message: "No provider connected. Connect an AI provider first." },
    });
    return;
  }

  let conv: Conversation;
  try {
    conv = await getConversation(id);
  } catch (err) {
    // e.g. no provider connected — surface it on the conversation's stream.
    publish(id, { type: "error", data: { message: errMessage(err) } });
    return;
  }

  const run = conv.queue.then(() => execTurn(conv, id, text, nonce, pin));
  // Keep the queue chain alive past a turn. execTurn already surfaces its own
  // failure as an `error` event, so this guard never swallows a user-visible one.
  conv.queue = run.catch(() => {});
  await run;
}

/**
 * Abort the in-flight turn for a conversation. Returns whether a live turn was
 * actually aborted: `false` means nothing was in flight — the conversation isn't
 * cached (e.g. the runtime restarted), so there is no turn to stop and no
 * terminal event will follow. The caller uses this to settle a card that's stuck
 * "running" because its owning turn died without ever settling it.
 */
export async function cancelTurn(id: string): Promise<boolean> {
  const conv = conversations.get(id);
  if (!conv) return false;
  // Surface a clear stop confirmation in the chat. Published BEFORE the abort so
  // it settles the turn first; pi's own abort rejection (if any) then arrives at
  // the already-settled stream and is ignored, so the user sees this one friendly
  // message instead of a raw abort error. STOPPED_BY_USER is matched verbatim by
  // the web adapter to render it as a neutral "you stopped it", not a failure.
  publish(id, { type: "error", data: { message: STOPPED_BY_USER } });
  await conv.session.abort();
  return true;
}

/**
 * The verbatim message a user-initiated stop surfaces. The control plane's relay
 * emits the same string on abort, and the web adapter matches it (isStoppedByUser)
 * to settle the chat as an intentional stop — back to the user, never a red error.
 */
export const STOPPED_BY_USER = "Stopped by user";

/**
 * Drop a conversation's live session (aborting any in-flight turn) and, when
 * requested, its on-disk pi session history. Used by DELETE /conversations/:id;
 * the transcript file itself is the store's job (deleteConversation).
 */
export async function disposeConversation(
  id: string,
  opts?: { deleteSessions?: boolean },
): Promise<void> {
  const conv = conversations.get(id);
  if (conv) {
    conversations.delete(id);
    await conv.session.abort();
    conv.session.dispose();
  }
  if (opts?.deleteSessions) {
    rmSync(join(config.dataDir, "sessions", id), {
      recursive: true,
      force: true,
    });
  }
}

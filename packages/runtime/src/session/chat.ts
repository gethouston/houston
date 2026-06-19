import {
  createAgentSession,
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { ToolCallRecord } from "@houston/runtime-client";
import { toWire } from "./wire";
import { config } from "../config";
import { authStorage, modelRegistry } from "../auth/storage";
import { resolveModel } from "../ai/providers";
import { toThinkingLevel } from "../ai/effort";
import { makeAgentLoader } from "./resource-loader";
import { appendAssistantMessage, appendUserMessage } from "../store/conversations";
import { publish } from "./bus";
import { syncServedCredential } from "../auth/serve";
import { makeRunCodeTool } from "./tools/run-code";
import { makeIdTokenProvider } from "./tools/gcp-id-token";
import { CLAMPED_FILE_TOOL_NAMES, makeClampedFileTools } from "./tools/clamped-fs";

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

// pi filters ALL tools (built-in and custom) against this name allowlist. A
// built-in like `bash` needs only its name here; a custom tool like `run_code`
// needs BOTH its name here AND its object in `customTools` (below) — omit either
// and pi filters it out. This is the pi SDK's design, not accidental duplication.
const TOOLS = useRemoteSandbox ? [...FILE_TOOLS, "run_code"] : [...FILE_TOOLS, "bash"];

type Conversation = { session: AgentSession; queue: Promise<unknown> };
const conversations = new Map<string, Conversation>();

const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

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

  const { session } = await createAgentSession({
    cwd: config.workspaceDir,
    agentDir: config.dataDir,
    model: resolveModel(), // active provider's model (Claude or Codex)
    authStorage,
    modelRegistry,
    sessionManager,
    resourceLoader: loader as any,
    tools: TOOLS,
    customTools: [...fileTools, ...(runCodeTool ? [runCodeTool] : [])],
  });

  const conv: Conversation = { session, queue: Promise.resolve() };
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
async function execTurn(conv: Conversation, id: string, text: string, nonce?: string, pin?: TurnPin) {
  appendUserMessage(id, text);
  publish(id, { type: "user", data: { content: text, ts: Date.now(), nonce } });

  let assistantText = "";
  const tools: ToolCallRecord[] = [];

  const unsub = conv.session.subscribe((e: any) => {
    const wire = toWire(e);
    if (!wire) return;
    if (wire.type === "text") assistantText += wire.data;
    else if (wire.type === "tool_start") tools.push({ name: wire.data.name });
    else if (wire.type === "tool_end") {
      const t = tools[tools.length - 1];
      if (t) t.isError = wire.data.isError;
    }
    publish(id, wire);
  });

  try {
    // A routine can pin a model/effort for its run. Re-point the (possibly
    // shared) session before prompting; pi clamps the thinking level to the
    // model. A bad model id throws here → surfaces as the turn's error event.
    if (pin?.model) await conv.session.setModel(resolveModel(pin.model));
    if (pin?.effort) {
      const level = toThinkingLevel(pin.effort);
      if (level) conv.session.setThinkingLevel(level);
    }
    await conv.session.prompt(text);
    appendAssistantMessage(id, assistantText, tools);
    publish(id, { type: "done", data: null });
  } catch (err) {
    if (assistantText) appendAssistantMessage(id, assistantText, tools);
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
export async function runTurn(id: string, text: string, nonce?: string, pin?: TurnPin): Promise<void> {
  // Connect-once: write the workspace's current central credential to auth.json
  // before the turn so pi uses the user's own token. Best-effort — a transient
  // failure leaves the existing (still-valid) credential, and a missing connection
  // surfaces below as the runtime's normal "No provider connected" error.
  try {
    await syncServedCredential();
  } catch (err) {
    console.error("[serve] credential sync failed:", errMessage(err));
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

/** Abort the in-flight turn for a conversation (if any). */
export async function cancelTurn(id: string): Promise<void> {
  const conv = conversations.get(id);
  if (conv) await conv.session.abort();
}

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
    rmSync(join(config.dataDir, "sessions", id), { recursive: true, force: true });
  }
}

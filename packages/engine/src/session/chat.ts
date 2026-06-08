import {
  createAgentSession,
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import type { ToolCallRecord, WireEvent } from "@houston/engine-client";
import { config } from "../config";
import { authStorage, modelRegistry } from "../auth/storage";
import { resolveModel } from "../ai/providers";
import { makeHeadlessLoader } from "./resource-loader";
import { appendAssistantMessage, appendUserMessage } from "../store/conversations";
import { publish } from "./bus";

const TOOLS = ["read", "ls", "grep", "find", "edit", "write", "bash"];

type Conversation = { session: AgentSession; queue: Promise<unknown> };
const conversations = new Map<string, Conversation>();

const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function getConversation(id: string): Promise<Conversation> {
  const existing = conversations.get(id);
  if (existing) return existing;

  const loader = makeHeadlessLoader(config.workspaceDir);
  await loader.reload();

  const sessionManager = SessionManager.create(
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
  });

  const conv: Conversation = { session, queue: Promise.resolve() };
  conversations.set(id, conv);
  return conv;
}

/** Map a pi AgentSession event to our wire event (or null to drop it). */
function toWire(e: any): WireEvent | null {
  switch (e.type) {
    case "message_update": {
      const a = e.assistantMessageEvent;
      if (a?.type === "text_delta") return { type: "text", data: a.delta ?? "" };
      if (a?.type === "thinking_delta")
        return { type: "thinking", data: a.delta ?? "" };
      return null;
    }
    case "tool_execution_start":
      return { type: "tool_start", data: { name: e.toolName, args: e.args } };
    case "tool_execution_end":
      return { type: "tool_end", data: { name: e.toolName, isError: !!e.isError } };
    default:
      return null;
  }
}

/**
 * Execute one turn: record the user + assistant messages durably and publish
 * every event to the conversation's bus. Self-contained: any failure is published
 * as an `error` event and never rethrown, so the per-conversation queue survives.
 */
async function execTurn(conv: Conversation, id: string, text: string, nonce?: string) {
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
export async function runTurn(id: string, text: string, nonce?: string): Promise<void> {
  let conv: Conversation;
  try {
    conv = await getConversation(id);
  } catch (err) {
    // e.g. no provider connected — surface it on the conversation's stream.
    publish(id, { type: "error", data: { message: errMessage(err) } });
    return;
  }

  const run = conv.queue.then(() => execTurn(conv, id, text, nonce));
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

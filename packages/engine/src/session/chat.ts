import {
  createAgentSession,
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import type { WireEvent, ToolCallRecord } from "@houston/engine-client";
import { config } from "../config";
import { authStorage, modelRegistry } from "../auth/storage";
import { resolveModel } from "../ai/providers";
import { makeHeadlessLoader } from "./resource-loader";
import { appendAssistantMessage, appendUserMessage } from "../store/conversations";

const TOOLS = ["read", "ls", "grep", "find", "edit", "write", "bash"];

type Conversation = { session: AgentSession; queue: Promise<unknown> };
const conversations = new Map<string, Conversation>();

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
 * Run one turn, forwarding wire events to `onEvent` and recording the
 * user + assistant messages to the durable store. Turns on the same
 * conversation are serialized (ordered resume).
 */
export async function runTurn(
  id: string,
  text: string,
  onEvent: (e: WireEvent) => void,
): Promise<void> {
  const conv = await getConversation(id);

  const run = conv.queue.then(async () => {
    appendUserMessage(id, text);
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
      onEvent(wire);
    });

    try {
      await conv.session.prompt(text);
      appendAssistantMessage(id, assistantText, tools);
      onEvent({ type: "done", data: null });
    } catch (err) {
      if (assistantText) appendAssistantMessage(id, assistantText, tools);
      onEvent({
        type: "error",
        data: { message: err instanceof Error ? err.message : String(err) },
      });
    } finally {
      unsub();
    }
  });

  conv.queue = run.catch(() => {});
  return run;
}

/** Abort the in-flight turn for a conversation (if any). */
export async function cancelTurn(id: string): Promise<void> {
  const conv = conversations.get(id);
  if (conv) await conv.session.abort();
}

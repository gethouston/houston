import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createAgentSession,
} from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolCallRecord, WireEvent } from "@houston/runtime-client";
import { config } from "../config";
import { makeAgentLoader } from "../session/resource-loader";
import { toWire } from "../session/wire";
import { CLAMPED_FILE_TOOL_NAMES, makeClampedFileTools } from "../session/tools/clamped-fs";
import { makeRunCodeTool } from "../session/tools/run-code";
import { makeIdTokenProvider } from "../session/tools/gcp-id-token";
import { appendAssistantMessageAt, appendUserMessageAt } from "../store/conversation-file";

/**
 * One pi turn against a hydrated throwaway root (<root>/workspace +
 * <root>/data). Unlike chat.ts (one long-lived process = one workspace, module
 * state), EVERYTHING here is per-request: auth storage, model registry,
 * session, tools. Nothing survives the request — that is the isolation story.
 *
 * Emits user/text/thinking/tool frames via `emit`; the TERMINAL frame is the
 * caller's job (it must sync the workspace back to object storage first, or a
 * client could see `done` before its files are durable).
 */

type Settings = { activeProvider?: string; models?: Record<string, string> };

/** Model for this turn: per-agent settings.json beats the env default. */
function resolveTurnModel(dataDir: string, provider: string) {
  let settings: Settings = {};
  const f = join(dataDir, "settings.json");
  if (existsSync(f)) {
    try {
      settings = JSON.parse(readFileSync(f, "utf8")) as Settings;
    } catch {
      settings = {};
    }
  }
  const fallback = provider === "anthropic" ? config.model : config.codexModel;
  return getModel(provider as never, (settings.models?.[provider] ?? fallback) as never);
}

export interface TurnOutcome {
  error?: string;
}

export async function runPiTurn(
  root: string,
  conversationId: string,
  text: string,
  provider: string,
  emit: (e: WireEvent) => void,
  signal: AbortSignal | undefined,
  nonce?: string,
): Promise<TurnOutcome> {
  const workspaceDir = join(root, "workspace");
  const dataDir = join(root, "data");
  const conversationsDir = join(dataDir, "conversations");

  appendUserMessageAt(conversationsDir, conversationId, text);
  emit({ type: "user", data: { content: text, ts: Date.now(), nonce } });

  let assistantText = "";
  const tools: ToolCallRecord[] = [];
  try {
    const authStorage = AuthStorage.create(join(dataDir, "auth.json"));
    const modelRegistry = ModelRegistry.create(authStorage, join(dataDir, "models.json"));
    const loader = makeAgentLoader(workspaceDir);
    await loader.reload();

    const sandbox = config.codeSandboxUrl
      ? makeRunCodeTool({
          baseUrl: config.codeSandboxUrl,
          token: config.codeSandboxToken,
          workspaceDir,
          limits: { maxConcurrent: config.runCodeMaxConcurrent, maxPerMinute: config.runCodePerMinute },
          idToken: makeIdTokenProvider(config.codeSandboxUrl),
        })
      : null;

    const { session } = await createAgentSession({
      cwd: workspaceDir,
      agentDir: dataDir,
      model: resolveTurnModel(dataDir, provider),
      authStorage,
      modelRegistry,
      sessionManager: SessionManager.continueRecent(
        workspaceDir,
        join(dataDir, "sessions", conversationId),
      ),
      resourceLoader: loader as never,
      // No bash, ever, in the cloud: untrusted code belongs to run_code.
      tools: [...CLAMPED_FILE_TOOL_NAMES, ...(sandbox ? ["run_code"] : [])],
      customTools: [...makeClampedFileTools(workspaceDir), ...(sandbox ? [sandbox] : [])],
    });

    const unsub = session.subscribe((e: unknown) => {
      const wire = toWire(e);
      if (!wire) return;
      if (wire.type === "text") assistantText += wire.data;
      else if (wire.type === "tool_start") tools.push({ name: wire.data.name });
      else if (wire.type === "tool_end") {
        const t = tools[tools.length - 1];
        if (t) t.isError = wire.data.isError;
      }
      emit(wire);
    });
    const onAbort = () => void session.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      await session.prompt(text);
    } finally {
      signal?.removeEventListener("abort", onAbort);
      unsub();
    }
    appendAssistantMessageAt(conversationsDir, conversationId, assistantText, tools);
    return {};
  } catch (err) {
    if (assistantText) appendAssistantMessageAt(conversationsDir, conversationId, assistantText, tools);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

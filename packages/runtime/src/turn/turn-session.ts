import { join } from "node:path";
import {
  type AgentSessionEvent,
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
  ProviderError,
  TokenUsage,
  ToolCallRecord,
  WireFrame,
} from "@houston/runtime-client";
import { DEFAULT_REASONING_EFFORT, toThinkingLevel } from "../ai/effort";
import { config } from "../config";
import { makeAgentLoader } from "../session/resource-loader";
import { buildToolSelection } from "../session/tool-selection";
import { makeClampedFileTools } from "../session/tools/clamped-fs";
import { makeIdTokenProvider } from "../session/tools/gcp-id-token";
import { makeRunCodeTool } from "../session/tools/run-code";
import { toWire } from "../session/wire";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
} from "../store/conversation-file";
import { resolveTurnModel } from "./turn-model";

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

export interface TurnOutcome {
  error?: string;
}

/** Per-turn model/effort pin (a routine's, when it pinned them). Absent = inherit. */
export interface TurnModelPin {
  model?: string | null;
  effort?: string | null;
}

/** Everything one pi turn needs (the per-turn server assembles it per request). */
export interface PiTurnRequest {
  conversationId: string;
  text: string;
  provider: string;
  /** Receives every non-terminal wire frame, already stamped with `turnId`. */
  emit: (e: WireFrame) => void;
  signal: AbortSignal | undefined;
  nonce?: string;
  pin?: TurnModelPin;
  /**
   * The turn's wire identity, minted by the per-turn SERVER (which also stamps
   * it on the terminal frame it sends after sync-back) — stamped here on every
   * emitted frame and persisted on both stored messages.
   */
  turnId: string;
}

export async function runPiTurn(
  root: string,
  turn: PiTurnRequest,
): Promise<TurnOutcome> {
  const { conversationId, text, provider, signal, nonce, pin, turnId } = turn;
  const emit = (e: WireFrame) => turn.emit({ ...e, turnId });
  const workspaceDir = join(root, "workspace");
  const dataDir = join(root, "data");
  const conversationsDir = join(dataDir, "conversations");

  appendUserMessageAt(conversationsDir, conversationId, text, { turnId });
  emit({ type: "user", data: { content: text, ts: Date.now(), nonce } });

  let assistantText = "";
  let usage: TokenUsage | null = null;
  const tools: ToolCallRecord[] = [];
  // A typed provider failure for this turn. pi resolves the turn rather than
  // throwing, so this arrives on the stream (a provider_error frame, emitted to
  // the client like any other) and is persisted on the assistant message so the
  // inline card survives a reload of this cloud conversation.
  let providerError: ProviderError | undefined;
  try {
    const authStorage = AuthStorage.create(join(dataDir, "auth.json"));
    const modelRegistry = ModelRegistry.create(
      authStorage,
      join(dataDir, "models.json"),
    );
    const loader = makeAgentLoader(workspaceDir);
    await loader.reload();

    const toolSelection = buildToolSelection({
      codeExecution: config.codeExecution === "remote" ? "remote" : "disabled",
      integrations: false,
    });
    const sandbox = toolSelection.includeRunCode
      ? makeRunCodeTool({
          baseUrl: config.codeSandboxUrl,
          token: config.codeSandboxToken,
          workspaceDir,
          limits: {
            maxConcurrent: config.runCodeMaxConcurrent,
            maxPerMinute: config.runCodePerMinute,
          },
          idToken: makeIdTokenProvider(config.codeSandboxUrl),
        })
      : null;

    const model = resolveTurnModel(dataDir, provider, pin?.model);
    // Ground-truth diagnostic: provider + model + the model's actual API base URL
    // (opencode.ai/zen/go/v1 = OpenCode Go, openai/chatgpt = Codex). Unambiguous,
    // unlike asking the model itself.
    const m = model as unknown as {
      id?: string;
      baseUrl?: string;
      reasoning?: boolean;
    };
    console.log(
      `[turn] provider=${provider} model=${m.id} baseUrl=${m.baseUrl}`,
    );
    // Effort → pi's thinking level. The turn's pin (the host bakes the agent's
    // saved effort into it) wins; if none and the model can reason, default to
    // medium so a "thinking" model actually reasons (pi enables reasoning only
    // when a level is set). pi clamps to what the model supports.
    const effort =
      pin?.effort ??
      (m.reasoning === true ? DEFAULT_REASONING_EFFORT : undefined);
    const thinkingLevel = toThinkingLevel(effort);
    const { session } = await createAgentSession({
      cwd: workspaceDir,
      agentDir: dataDir,
      model,
      ...(thinkingLevel ? { thinkingLevel } : {}),
      authStorage,
      modelRegistry,
      sessionManager: SessionManager.continueRecent(
        workspaceDir,
        join(dataDir, "sessions", conversationId),
      ),
      resourceLoader: loader as never,
      // No bash, ever, in cloud turn mode.
      tools: toolSelection.toolNames,
      customTools: [
        ...makeClampedFileTools(workspaceDir),
        ...(sandbox ? [sandbox] : []),
      ],
    });

    const unsub = session.subscribe((e: AgentSessionEvent) => {
      const wire = toWire(e);
      if (!wire) return;
      if (wire.type === "text") assistantText += wire.data;
      else if (wire.type === "usage") usage = wire.data;
      else if (wire.type === "tool_start") tools.push({ name: wire.data.name });
      else if (wire.type === "tool_end") {
        const t = tools[tools.length - 1];
        if (t) t.isError = wire.data.isError;
      } else if (wire.type === "provider_error") providerError = wire.data;
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
    // Persist the turn's assistant message with any typed provider error so the
    // inline card survives a reload of this cloud conversation. The provider_error
    // frame was already streamed to the client (which settles on it), so this
    // returns no `outcome.error` — the per-turn server's trailing terminal is a
    // no-op for the already-settled client, and reporting an error here would make
    // it send a SECOND, generic error frame on top of the typed card.
    appendAssistantMessageAt(conversationsDir, conversationId, assistantText, {
      tools,
      usage,
      providerError,
      turnId,
    });
    return {};
  } catch (err) {
    if (assistantText || providerError)
      appendAssistantMessageAt(
        conversationsDir,
        conversationId,
        assistantText,
        { tools, usage, providerError, turnId },
      );
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

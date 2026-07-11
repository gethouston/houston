import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { TurnMode } from "@houston/protocol";
import type {
  PendingInteraction,
  ProviderError,
  TokenUsage,
  ToolCallRecord,
  WireEvent,
  WireFrame,
} from "@houston/runtime-client";
import { DEFAULT_REASONING_EFFORT, toThinkingLevel } from "../ai/effort";
import { classifyProviderError } from "../ai/provider-error";
import { createPiBackend } from "../backends/pi/backend";
import { config } from "../config";
import {
  diffSnapshots,
  type FileSnapshot,
  snapshotWorkspace,
} from "../session/file-changes";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../session/interaction";
import { buildToolSelection } from "../session/tool-selection";
import { makeAskUserTool } from "../session/tools/ask-user";
import { makeClampedFileTools } from "../session/tools/clamped-fs";
import { makeIdTokenProvider } from "../session/tools/gcp-id-token";
import { makePlanReadyTool } from "../session/tools/plan-ready";
import { makeRunCodeTool } from "../session/tools/run-code";
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
  /**
   * What the model ended the turn waiting on the user for (ask_user), if
   * anything. The per-turn SERVER carries it on the clean terminal `done` frame
   * it sends after sync-back — never on an error. request_connection isn't
   * available here (integrations are off in cloud turn mode).
   */
  pendingInteraction?: PendingInteraction;
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
   * The turn's execution mode ("plan" = read-only + planning overlay). Absent =
   * execute. Threaded into the pi session's tool allowlist + system prompt via
   * `createSession`, identical to the long-lived server path.
   */
  mode?: TurnMode;
  /**
   * The turn's wire identity, minted by the per-turn SERVER (which also stamps
   * it on the terminal frame it sends after sync-back) — stamped here on every
   * emitted frame and persisted on both stored messages.
   */
  turnId: string;
  /**
   * Presentation-only bubble text, when it must differ from `text` (the real
   * prompt the model runs on). Persisted alongside the user message so a
   * history reload renders `displayText ?? content`. Absent when they match.
   */
  displayText?: string;
}

export async function runPiTurn(
  root: string,
  turn: PiTurnRequest,
): Promise<TurnOutcome> {
  const {
    conversationId,
    text,
    provider,
    signal,
    nonce,
    pin,
    mode,
    turnId,
    displayText,
  } = turn;
  const emit = (e: WireFrame) => turn.emit({ ...e, turnId });
  const workspaceDir = join(root, "workspace");
  const dataDir = join(root, "data");
  const conversationsDir = join(dataDir, "conversations");

  appendUserMessageAt(conversationsDir, conversationId, text, {
    turnId,
    displayText,
  });
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
    // Per-request pi backend rooted at the throwaway dirs. Same factory the
    // long-lived server uses (backends/pi) — here nothing survives the request:
    // auth, registry, tools, and session are all per-turn. No bash, ever, in
    // cloud turn mode.
    const backend = createPiBackend({
      workspaceDir,
      dataDir,
      authStorage,
      modelRegistry,
      tools: toolSelection.toolNames,
      customTools: [
        ...makeClampedFileTools(workspaceDir),
        // ask_user is available in every mode (holds no credential); its name is
        // already in toolSelection.toolNames. request_connection is NOT — it is
        // gated with the integration tools, which are off in cloud turn mode.
        makeAskUserTool(),
        // plan_ready is registered always but name-gated to Plan mode by
        // toolNamesForMode (harmless in execute/auto — pi exposes it only when
        // its name is in the mode's allowlist).
        makePlanReadyTool(),
        ...(sandbox ? [sandbox] : []),
      ],
    });
    const session = await backend.createSession({
      conversationId,
      model,
      ...(thinkingLevel ? { thinkingLevel } : {}),
      // The turn's mode clamps this pi session's tools + overlays its prompt,
      // exactly as the long-lived server path does (createPiBackend applies
      // `toolNamesForMode` + the loader overlay from `opts.mode`): plan →
      // read-only, auto → no blocking tools. In cloud turn mode ask_user is the
      // only blocking tool present (integrations are off), so an auto turn here
      // simply drops it.
      ...(mode ? { mode } : {}),
    });

    // Snapshot the hydrated workspace so the turn's created/modified files can
    // be surfaced as a `file_changes` frame. The per-turn root is exclusive to
    // this request, so the diff is attributable by construction. Best-effort.
    let beforeFiles: FileSnapshot | null = null;
    try {
      beforeFiles = snapshotWorkspace(workspaceDir);
    } catch (err) {
      console.warn(
        "[turn] file snapshot failed:",
        err instanceof Error ? err.message : String(err),
      );
    }

    const unsub = session.subscribe((wire: WireEvent) => {
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
    // A fresh per-turn holder for whatever the model ends up waiting on the user
    // for (ask_user); established for the prompt's async subtree so the tool
    // records into it. Read after prompt() resolves, returned on the outcome.
    const interaction = newInteractionHolder();
    try {
      await runWithInteractionCapture(interaction, () => session.prompt(text));
    } finally {
      signal?.removeEventListener("abort", onAbort);
      unsub();
    }
    // Diff what this turn created/modified; skipped on a failed turn (a
    // provider error means the model never finished). Emitted BEFORE the
    // caller's terminal frame, mirroring the long-lived runtime's order.
    let fileChanges: { created: string[]; modified: string[] } | undefined;
    if (beforeFiles && !providerError) {
      try {
        const changes = diffSnapshots(
          beforeFiles,
          snapshotWorkspace(workspaceDir),
        );
        if (changes.created.length || changes.modified.length)
          fileChanges = changes;
      } catch (err) {
        console.warn(
          "[turn] file diff failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
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
      fileChanges,
      // Same clean-only condition as the returned outcome (below): persist the
      // pending question only when the turn ended without a provider error, so
      // a reload of this cloud conversation settles to `needs_you`, not a false
      // `done`. Mirrors exec-turn — only the clean turn carries it.
      pendingInteraction: providerError ? undefined : interaction.pending,
      turnId,
    });
    if (fileChanges) emit({ type: "file_changes", data: fileChanges });
    // Carry the pending question only on a clean turn — never alongside a
    // provider error (mirrors exec-turn: only the clean `done` carries it).
    return providerError ? {} : { pendingInteraction: interaction.pending };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Classify the throw before reporting a generic outcome error: pi RAISES
    // a missing/expired credential at prompt time ("No API key found for
    // <provider>. Use /login …"), before any stream exists, so this catch is
    // the only place it can become the typed reconnect card (HOU-718 —
    // mirrors exec-turn). The typed error is emitted as a provider_error
    // frame (the terminal the client settles on) and persisted so the card
    // survives a reload; returning `{}` keeps the per-turn server from
    // stacking a second, generic error frame on top of it.
    if (!providerError) {
      const thrown = classifyProviderError({
        provider,
        model: pin?.model ?? null,
        message,
      });
      // Prompt-time credential guard: pi raised BEFORE recording the user
      // message in its session store, so the reconnect retry must re-deliver
      // the text (mirrors exec-turn).
      if (
        thrown.kind === "unauthenticated" &&
        !assistantText &&
        tools.length === 0
      )
        thrown.undelivered_prompt = text;
      if (thrown.kind !== "unknown") {
        appendAssistantMessageAt(
          conversationsDir,
          conversationId,
          assistantText,
          { tools, usage, providerError: thrown, turnId },
        );
        emit({ type: "provider_error", data: thrown });
        return {};
      }
    }
    if (assistantText || providerError)
      appendAssistantMessageAt(
        conversationsDir,
        conversationId,
        assistantText,
        { tools, usage, providerError, turnId },
      );
    return { error: message };
  }
}

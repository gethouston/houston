import { join } from "node:path";
import type {
  ProviderError,
  TokenUsage,
  ToolCallRecord,
  WireEvent,
  WireFrame,
} from "@houston/runtime-client";
import {
  newUsedTokenCapture,
  runWithUsedTokenCapture,
} from "../auth/used-token";
import { framePrompt } from "../session/attribution";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../session/interaction";
import {
  appendUserMessageAt,
  loadConversation,
} from "../store/conversation-file";
import { openTurnBackendSession } from "./turn-session-backend";
import { handleTurnSessionFailure } from "./turn-session-failure";
import type { RunTurnDeps } from "./turn-session-startup";
import {
  captureWorkspaceSnapshot,
  finishSuccessfulTurn,
} from "./turn-session-success";
import type {
  TurnDirectories,
  TurnOutcome,
  TurnSessionRequest,
} from "./turn-session-types";

/**
 * One pi turn against resolved hydrated directories. Unlike chat.ts (one
 * long-lived process = one workspace, module
 * state), EVERYTHING here is per-request: auth storage, model registry,
 * session, tools. Nothing survives the request — that is the isolation story.
 *
 * Emits user/text/thinking/tool frames via `emit`; the TERMINAL frame is the
 * caller's job (it must sync the workspace back to object storage first, or a
 * client could see `done` before its files are durable).
 */

export type { RunTurnDeps } from "./turn-session-startup";
export type {
  TurnDirectories,
  TurnModelPin,
  TurnOutcome,
  TurnRunner,
  TurnSessionRequest,
} from "./turn-session-types";

export async function runTurn(
  directories: TurnDirectories,
  turn: TurnSessionRequest,
  deps: RunTurnDeps = {},
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
    mentions,
    author,
  } = turn;
  const emit = (e: WireFrame) => turn.emit({ ...e, turnId });
  const { workspaceDir, dataDir } = directories;
  const conversationsDir = join(dataDir, "conversations");

  const canonicalMessages =
    loadConversation(conversationsDir, conversationId)?.messages ?? [];
  const priorAuthors = author
    ? canonicalMessages
        .filter((message) => message.role === "user")
        .map((message) => message.author)
    : [];
  appendUserMessageAt(conversationsDir, conversationId, text, {
    author,
    turnId,
    displayText,
    mentions,
  });
  emit({
    type: "user",
    data: { content: text, ts: Date.now(), nonce, mentions },
  });

  let assistantText = "";
  let usage: TokenUsage | null = null;
  const tools: ToolCallRecord[] = [];
  // A typed provider failure for this turn. pi resolves the turn rather than
  // throwing, so this arrives on the stream (a provider_error frame, emitted to
  // the client like any other) and is persisted on the assistant message so the
  // inline card survives a reload of this cloud conversation.
  let providerError: ProviderError | undefined;
  /**
   * WHICH access token this turn ran on, for the revoked-token report
   * (auth/used-token.ts, PRODUCT-1319). This path's `ModelRuntime` uses pi's
   * OWN file-backed store (not `HoustonAuthStore`), so nothing records at
   * request time — instead the capture is SEEDED from the hydrated per-request
   * auth.json below. That read is exact here: the root is a throwaway copy
   * exclusive to this request, and its served entries are access-only (Gate
   * #2, no refresh token), so no re-serve or refresh can rotate the token
   * between the seed and a failure. Held outside the try so the catch can
   * still name the failed token.
   */
  const usedTokens = newUsedTokenCapture();
  try {
    const { replay, session } = await openTurnBackendSession({
      directories,
      turn,
      deps,
      canonicalMessages,
      usedTokens,
    });

    // Snapshot the hydrated workspace so the turn's created/modified files can
    // be surfaced as a `file_changes` frame. The per-turn root is exclusive to
    // this request, so the diff is attributable by construction. Best-effort.
    const beforeFiles = captureWorkspaceSnapshot(workspaceDir);

    const unsub = session.subscribe((wire: WireEvent) => {
      // First provider-originated event = the honest first-token bound. Set
      // once; the terminal frame reports it as a delta.
      if (turn.timings && turn.timings.t_first_model_event === undefined)
        turn.timings.t_first_model_event = performance.now();
      if (wire.type === "text") assistantText += wire.data;
      else if (wire.type === "usage") usage = wire.data;
      else if (wire.type === "tool_start") tools.push({ name: wire.data.name });
      else if (wire.type === "tool_end") {
        const t = tools[tools.length - 1];
        if (t) t.isError = wire.data.isError;
      } else if (wire.type === "provider_error") {
        providerError = wire.data;
      }
      emit(wire);
    });
    const onAbort = () => void session.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    // A fresh per-turn holder for whatever the model ends up waiting on the user
    // for (ask_user); established for the prompt's async subtree so the tool
    // records into it. Read after prompt() resolves, returned on the outcome.
    const interaction = newInteractionHolder();
    try {
      // The used-token capture spans the prompt so the streamed error path
      // (pi/wire.ts) reads THIS turn's seeded token when it reports.
      await runWithInteractionCapture(interaction, () =>
        runWithUsedTokenCapture(usedTokens, () =>
          session.prompt(
            (replay?.text ?? "") + framePrompt(text, author, priorAuthors),
          ),
        ),
      );
    } finally {
      signal?.removeEventListener("abort", onAbort);
      unsub();
    }
    return finishSuccessfulTurn({
      beforeFiles,
      providerError,
      workspaceDir,
      mode,
      assistantText,
      interaction,
      conversationsDir,
      conversationId,
      tools,
      usage,
      provider,
      turnId,
      emit,
    });
  } catch (error) {
    return handleTurnSessionFailure({
      error,
      signal,
      providerError,
      assistantText,
      tools,
      usage,
      conversationsDir,
      conversationId,
      turnId,
      provider,
      model: pin?.model,
      text,
      usedTokens,
      emit,
    });
  }
}

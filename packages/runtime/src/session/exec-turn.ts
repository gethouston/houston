import { DEFAULT_TURN_MODE, type TurnMode } from "@houston/protocol";
import {
  effectiveModelWindow,
  modelInputLimit,
} from "@houston/protocol/model-windows";
import type {
  ChatMessage,
  ProviderError,
  TokenUsage,
  ToolCallRecord,
  WireEvent,
} from "@houston/runtime-client";
import { DEFAULT_REASONING_EFFORT, toThinkingLevel } from "../ai/effort";
import { unansweredWindows } from "../ai/first-byte";
import {
  learnCustomContextWindow,
  OPENAI_COMPATIBLE,
} from "../ai/openai-compatible";
import {
  classifyProviderError,
  ModelNotOfferedError,
} from "../ai/provider-error";
import { logProviderError } from "../ai/provider-error-log";
import {
  activeEffort,
  canonicalPinProvider,
  resolveModel,
} from "../ai/providers";
import { recordTokenSpend } from "../ai/usage/ledger";
import {
  clearProviderMarks,
  noteAuthFailure,
  noteQuotaExhausted,
} from "../auth/credential-health";
import { reportRevokedServedToken } from "../auth/report-revoked";
import {
  newUsedTokenCapture,
  runWithUsedTokenCapture,
} from "../auth/used-token";
import { config } from "../config";
import {
  appendAssistantMessage,
  appendUserMessage,
  consumeSessionReplay,
  getHistory,
  stampSessionReplay,
} from "../store/conversations";
import { type ActingContext, runWithActingContext } from "./acting-context";
import {
  decodeActingAuthor,
  framePrompt,
  type MessageAuthor,
} from "./attribution";
import { needsAutocompact } from "./autocompact";
import { runAutocompact } from "./autocompact-guard";
import { publish } from "./bus";
import { resolveChildMemoryCap } from "./child-memory-fence";
import { evictClaudeSessionOnRevokedToken } from "./claude-token-guard";
import {
  type Conversation,
  conversations,
  switchBackendIfNeeded,
  switchModeIfNeeded,
} from "./conversation-cache";
import { runWithConversationId } from "./conversation-context";
import { compactWithFactHarvest } from "./durable-facts-harvest";
import {
  diffSnapshots,
  type FileSnapshot,
  snapshotWorkspace,
} from "./file-changes";
import { recoverFollowUpActions } from "./follow-up-pass";
import {
  newInteractionHolder,
  planReadyFallback,
  runWithInteractionCapture,
} from "./interaction";
import { reportMissionSettle } from "./mission-settle";
import {
  collectStandingTurnCalls,
  type TurnStartupMarks,
} from "./model-call-report";
import { switchNeedsCompaction } from "./provider-switch";
import { subscribeFinishMarks } from "./reply-complete";
import { replayForConversation } from "./routine-replay";
import { resetRoutineSessionIfNeeded } from "./routine-session-reset";
import { describeStall, stallFailure } from "./stall-failure";
import {
  createStallWatchdog,
  isAbortEcho,
  type StallReason,
} from "./stall-watchdog";
import { turnFramePublisher } from "./turn-frame-gate";
import {
  clearInflightMarker,
  noteInflightTool,
  writeInflightMarker,
} from "./turn-inflight-marker";
import { runWithTurnMode, type TurnModeRef } from "./turn-mode-context";
import { runWithTurnModel } from "./turn-model-context";
import { buildTurnResumeInfo } from "./turn-resume-info";
import { settleStoppedBeforePrompt } from "./turn-stopped-before-prompt";
import type { ProvidedContext } from "./workspace-context";

export interface CleanTurn {
  model: { provider: string; id: string };
}

export interface TurnPin {
  nextStepSuggestions?: boolean;
  timezone?: string;
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
  mode?: TurnMode | null;
}

export interface RecordedUserTurn {
  author: MessageAuthor | undefined;
  priorAuthors: ReadonlyArray<MessageAuthor | undefined>;
  routineFire?: boolean;
}

const errMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

export function recordUserTurn(
  conv: Conversation,
  id: string,
  turnId: string,
  text: string,
  nonce?: string,
  acting?: ActingContext,
  displayText?: string,
  mentions?: ChatMessage["mentions"],
  resume?: { pin?: TurnPin; resumeOf?: string; context?: ProvidedContext },
): RecordedUserTurn {
  conv.turnId = turnId;
  const author = decodeActingAuthor(acting?.actingAs);
  const priorAuthors = author
    ? (getHistory(id)?.messages ?? [])
        .filter((m) => m.role === "user")
        .map((m) => m.author)
    : [];

  appendUserMessage(id, text, { author, turnId, nonce, displayText, mentions });
  const resumeInfo = buildTurnResumeInfo(resume?.pin, acting, resume?.context);
  writeInflightMarker(config.dataDir, {
    conversationId: id,
    turnId,
    startedAt: Date.now(),
    fenced: resolveChildMemoryCap() !== null,
    ...(resumeInfo ? { resume: resumeInfo } : {}),
    ...(resume?.resumeOf !== undefined ? { resumeOf: resume.resumeOf } : {}),
  });
  publish(id, {
    type: "user",
    data: { content: text, ts: Date.now(), nonce, author, mentions },
    turnId,
  });
  return { author, priorAuthors };
}

export async function execTurn(
  conv: Conversation,
  id: string,
  turnId: string,
  text: string,
  recorded: RecordedUserTurn,
  pin?: TurnPin,
  acting?: ActingContext,
  startup?: TurnStartupMarks,
): Promise<CleanTurn | null> {
  const { author, priorAuthors } = recorded;
  const emit = turnFramePublisher(conv, id, turnId);
  const enteredAt = performance.now();
  let modelCalls: ReturnType<typeof collectStandingTurnCalls> | undefined;
  let clean: CleanTurn | null = null;
  let assistantText = "";
  let thinkingText = "";
  let usage: TokenUsage | null = null;
  const tools: ToolCallRecord[] = [];
  let providerError: ProviderError | undefined;
  let thrownTyped: ProviderError | undefined;
  let replayedHistory = false;

  let stalled: { reason: StallReason; windowMs: number } | undefined;
  const interaction = newInteractionHolder();
  const watchdog = createStallWatchdog({
    timeoutMs: config.turnStallTimeoutMs,
    firstResponseMs: unansweredWindows(config.turnFirstByteDeadlineMs),
    onStall: (reason, windowMs) => {
      stalled = { reason, windowMs };
      console.warn(
        `[turn] stall watchdog aborted the turn: ${describeStall(reason, windowMs)} (conversation=${id} turn=${turnId})`,
      );
      void conv.session.abort();
    },
  });

  let unsub: (() => void) | undefined;
  let unsubLiveness: (() => void) | undefined;
  let unsubMessageStart: (() => void) | undefined;
  let unsubPhase: (() => void) | undefined;
  const subscribeSession = () => {
    modelCalls = collectStandingTurnCalls(
      conv.session,
      conv.backendId,
      enteredAt,
      startup,
    );
    unsubLiveness = conv.session.subscribeLiveness?.(() => watchdog.touch());
    unsubPhase = conv.session.subscribeModelPhase?.((phase) =>
      watchdog.onPhase(phase),
    );
    unsubMessageStart = subscribeFinishMarks(
      conv.session,
      interaction.finish,
      emit,
      () => watchdog.onResponseStart(),
    );
    unsub = conv.session.subscribe((wire: WireEvent) => {
      if (wire.type === "text") {
        assistantText += wire.data;
        interaction.finish.noteAssistantText(wire.data);
      } else if (wire.type === "thinking") thinkingText += wire.data;
      else if (wire.type === "usage") usage = wire.data;
      else if (wire.type === "tool_start") {
        tools.push({ name: wire.data.name, input: wire.data.args });
        try {
          noteInflightTool(config.dataDir, id, wire.data.name);
        } catch (error) {
          console.warn("[turn] in-flight marker tool note failed:", error);
        }
      } else if (wire.type === "tool_end") {
        const t = tools[tools.length - 1];
        if (t) {
          t.isError = wire.data.isError;
          if (wire.data.content) t.result = wire.data.content;
          if (wire.data.mission) t.mission = wire.data.mission;
        }
      } else if (wire.type === "provider_error") {
        if (
          stalled ||
          (conv.stoppedTurnId === turnId && isAbortEcho(wire.data))
        )
          return;
        providerError = wire.data;
      }
      watchdog.onEvent(wire);
      emit(wire);
    });
  };

  let providerSwitch: ChatMessage["providerSwitch"];
  let compaction: ChatMessage["compaction"];
  let turnProvider: string | undefined;
  let turnModel: string | undefined;
  const attributedProvider = (fallback: string) =>
    turnProvider ??
    (pin?.provider ? canonicalPinProvider(pin.provider) : fallback);
  const usedTokens = newUsedTokenCapture();
  const stoppedBeforePrompt = (): boolean => {
    if (conv.stoppedTurnId !== turnId) return false;
    settleStoppedBeforePrompt(id, turnId, {
      replayedHistory,
      providerSwitch,
      compaction,
      modelCalls: modelCalls?.report(turnId),
    });
    return true;
  };
  try {
    if (stoppedBeforePrompt()) return null;
    const model = resolveModel(pin?.model, pin?.provider);
    turnProvider = model.provider;
    turnModel = model.id;
    const liveMode: TurnModeRef = { current: pin?.mode ?? DEFAULT_TURN_MODE };
    conv.liveMode = liveMode;
    const mode = liveMode.current;
    const providerChanged = model.provider !== conv.provider;
    const modelChanged = model.id !== conv.model;
    const routineReset = await resetRoutineSessionIfNeeded(
      conv,
      id,
      turnId,
      model,
      mode,
      recorded.routineFire ? "fire" : "chat",
    );
    const { rebuilt, preTokens: rebuiltPreTokens } =
      await switchBackendIfNeeded(
        conv,
        id,
        model,
        mode,
        pin?.nextStepSuggestions,
        pin?.timezone,
      );
    await switchModeIfNeeded(
      conv,
      id,
      model,
      mode,
      pin?.nextStepSuggestions,
      pin?.timezone,
    );
    subscribeSession();
    let replayPrefix = "";
    const sessionWasReset = consumeSessionReplay(id);
    replayedHistory = rebuilt || sessionWasReset || routineReset !== null;
    const replayWindow = effectiveModelWindow(
      model.provider,
      model.id,
      model.contextWindow,
      0,
    );
    if (routineReset) {
      replayPrefix = routineReset.replay?.text ?? "";
    } else if (rebuilt) {
      const replay = replayForConversation({
        conversationId: id,
        messages: getHistory(id)?.messages ?? [],
        currentTurnId: turnId,
        dirs: config,
        windowTokens: replayWindow,
      });
      replayPrefix = replay?.text ?? "";
      providerSwitch = {
        provider: model.provider,
        summarized: replay?.truncated ?? false,
        pre_tokens: rebuiltPreTokens,
      };
      emit({ type: "provider_switched", data: providerSwitch });
    } else if (sessionWasReset) {
      const replay = replayForConversation({
        conversationId: id,
        messages: getHistory(id)?.messages ?? [],
        currentTurnId: turnId,
        dirs: config,
        windowTokens: replayWindow,
        reason: "reset",
      });
      replayPrefix = replay?.text ?? "";
    } else if (providerChanged || modelChanged) {
      const preTokens = providerChanged
        ? (conv.session.getContextUsage()?.tokens ?? null)
        : null;
      await conv.session.setModel(model);
      if (providerChanged) {
        const targetWindow = effectiveModelWindow(
          model.provider,
          model.id,
          model.contextWindow,
          0,
        );
        let summarized = false;
        if (switchNeedsCompaction(preTokens, targetWindow)) {
          await compactWithFactHarvest(conv.session, id);
          summarized = true;
        }
        providerSwitch = {
          provider: model.provider,
          summarized,
          pre_tokens: preTokens,
        };
        emit({ type: "provider_switched", data: providerSwitch });
      }
      conv.provider = model.provider;
      conv.model = model.id;
    }
    if (!providerSwitch?.summarized && !compaction) {
      conv.session.clearStaleToolResults?.();
      const fill = conv.session.getContextUsage()?.tokens ?? null;
      const window = effectiveModelWindow(
        model.provider,
        model.id,
        model.contextWindow,
        fill ?? 0,
      );
      if (
        needsAutocompact(fill, window, undefined, modelInputLimit(model.id))
      ) {
        if (
          await runAutocompact(conv.session, id, {
            provider: model.provider,
            id: model.id,
          })
        ) {
          compaction = { trigger: "proactive", pre_tokens: fill };
          emit({ type: "context_compacted", data: compaction });
        }
      }
    }
    if (stoppedBeforePrompt()) return null;
    const reasons = (model as { reasoning?: boolean }).reasoning === true;
    const effort =
      pin?.effort ??
      activeEffort() ??
      (reasons ? DEFAULT_REASONING_EFFORT : undefined);
    if (effort) {
      const level = toThinkingLevel(effort);
      if (level) conv.session.setThinkingLevel(level);
    }
    const promptText = replayPrefix + framePrompt(text, author, priorAuthors);
    let beforeFiles: FileSnapshot | null = null;
    try {
      beforeFiles = snapshotWorkspace(config.workspaceDir);
    } catch (err) {
      console.warn("[turn] file snapshot failed:", errMessage(err));
    }
    watchdog.arm();
    modelCalls?.notePrompt();
    try {
      await runWithActingContext(acting, () =>
        runWithConversationId(id, () =>
          runWithTurnMode(liveMode, () =>
            runWithTurnModel(
              { provider: model.provider, model: model.id },
              () =>
                runWithInteractionCapture(interaction, () =>
                  runWithUsedTokenCapture(usedTokens, () =>
                    conv.session.prompt(promptText),
                  ),
                ),
            ),
          ),
        ),
      );
    } finally {
      watchdog.disarm();
    }
    await recoverFollowUpActions({
      session: conv.session,
      interaction,
      conversationId: id,
      turnId,
      planMode: mode === "plan" || liveMode.current === "plan",
      assistantText,
      userText: text,
      nextStepSuggestions: pin?.nextStepSuggestions,
      failed:
        Boolean(providerError || stalled) || conv.stoppedTurnId === turnId,
      isStopped: () => conv.stoppedTurnId === turnId,
    });
    const stopped = conv.stoppedTurnId === turnId;
    if (stalled && !providerError && !stopped) {
      providerError = stallFailure(
        stalled.reason,
        stalled.windowMs,
        model.provider,
      );
      emit({ type: "provider_error", data: providerError });
    }
    if (
      providerError?.kind === "context_overflow" &&
      model.provider === OPENAI_COMPATIBLE &&
      providerError.context_window_tokens
    )
      learnCustomContextWindow(providerError.context_window_tokens);
    let fileChanges: ChatMessage["fileChanges"];
    if (beforeFiles && !providerError) {
      try {
        const changes = diffSnapshots(
          beforeFiles,
          snapshotWorkspace(config.workspaceDir),
        );
        if (changes.created.length || changes.modified.length)
          fileChanges = changes;
      } catch (err) {
        console.warn("[turn] file diff failed:", errMessage(err));
      }
    }
    const pendingInteraction =
      !providerError &&
      !stopped &&
      (mode === "plan" || liveMode.current === "plan") &&
      assistantText.trim() &&
      !interaction.pending
        ? planReadyFallback()
        : interaction.pending;
    if (
      replayedHistory &&
      (providerError || stopped) &&
      !assistantText.trim() &&
      conv.backendId !== "pi"
    ) {
      stampSessionReplay(id);
    }
    appendAssistantMessage(id, assistantText, {
      tools,
      thinking: thinkingText || undefined,
      usage,
      providerSwitch,
      compaction,
      providerError,
      fileChanges,
      stopped: stopped ? true : undefined,
      pendingInteraction:
        providerError || stopped ? undefined : pendingInteraction,
      turnId,
    });
    if (usage) recordTokenSpend(model.provider, usage);
    if (fileChanges) emit({ type: "file_changes", data: fileChanges });
    if (!providerError && !stopped) {
      clearProviderMarks(model.provider);
      clean = { model: { provider: model.provider, id: model.id } };
      emit({
        type: "done",
        data: null,
        ...(pendingInteraction ? { pendingInteraction } : {}),
      });
    }
    reportMissionSettle(
      id,
      providerError ? "error" : "needs_you",
      providerError || stopped ? null : (pendingInteraction ?? null),
      turnId,
      stopped,
      modelCalls?.report(turnId),
    );
  } catch (err) {
    const attributedModel = turnModel ?? pin?.model ?? null;
    const thrown =
      providerError ??
      (err instanceof ModelNotOfferedError ? err.providerError : null) ??
      classifyProviderError({
        provider: attributedProvider(""),
        model: attributedModel,
        message: errMessage(err),
      });
    if (!providerError) logProviderError(thrown, { model: attributedModel });
    if (
      thrown.kind === "unauthenticated" &&
      !providerError &&
      !assistantText &&
      tools.length === 0
    )
      thrown.undelivered_prompt = text;
    if (
      thrown.kind === "unauthenticated" &&
      !providerError &&
      thrown.provider
    ) {
      noteAuthFailure(canonicalPinProvider(thrown.provider));
      reportRevokedServedToken(thrown, usedTokens.digestFor(thrown.provider));
    }
    if (thrown.kind === "quota_exhausted" && !providerError && thrown.provider)
      noteQuotaExhausted(
        canonicalPinProvider(thrown.provider),
        thrown.resets_at,
      );
    const typed = thrown.kind !== "unknown" ? thrown : undefined;
    thrownTyped = typed;
    if (replayedHistory && !assistantText.trim() && conv.backendId !== "pi") {
      stampSessionReplay(id);
    }
    appendAssistantMessage(id, assistantText, {
      tools,
      thinking: thinkingText || undefined,
      usage,
      providerSwitch,
      compaction,
      providerError: typed ?? {
        kind: "unknown",
        provider: attributedProvider("unknown"),
        raw_excerpt: errMessage(err),
      },
      turnId,
    });
    if (typed && !providerError) emit({ type: "provider_error", data: typed });
    else if (!typed)
      emit({ type: "error", data: { message: errMessage(err) } });
    reportMissionSettle(
      id,
      "error",
      null,
      turnId,
      conv.stoppedTurnId === turnId,
      modelCalls?.report(turnId),
    );
  } finally {
    unsub?.();
    unsubLiveness?.();
    unsubPhase?.();
    unsubMessageStart?.();
    modelCalls?.stop();
    conv.turnId = undefined;
    clearInflightMarker(config.dataDir, id);
    conv.liveMode = undefined;
    conv.stoppedTurnId = undefined;
    watchdog.disarm();
    evictClaudeSessionOnRevokedToken(
      conversations,
      id,
      conv,
      thrownTyped ?? providerError,
    );
  }
  return clean;
}

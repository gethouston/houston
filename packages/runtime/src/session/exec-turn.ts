import { DEFAULT_TURN_MODE, type TurnMode } from "@houston/protocol";
import { effectiveModelWindow } from "@houston/protocol/model-windows";
import type {
  ChatMessage,
  ProviderError,
  TokenUsage,
  ToolCallRecord,
  WireEvent,
} from "@houston/runtime-client";
import { DEFAULT_REASONING_EFFORT, toThinkingLevel } from "../ai/effort";
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
import { publish } from "./bus";
import { evictClaudeSessionOnRevokedToken } from "./claude-token-guard";
import {
  type Conversation,
  conversations,
  switchBackendIfNeeded,
  switchModeIfNeeded,
} from "./conversation-cache";
import { runWithConversationId } from "./conversation-context";
import {
  diffSnapshots,
  type FileSnapshot,
  snapshotWorkspace,
} from "./file-changes";
import {
  newInteractionHolder,
  planReadyFallback,
  runWithInteractionCapture,
} from "./interaction";
import { reportMissionSettle } from "./mission-settle";
import { switchNeedsCompaction } from "./provider-switch";
import { renderReplayPreamble, replayCharBudget } from "./replay-transcript";
import { createStallWatchdog } from "./stall-watchdog";
import { runWithTurnMode, type TurnModeRef } from "./turn-mode-context";
import { runWithTurnModel } from "./turn-model-context";

/** A turn's pinned provider/model/effort/mode. Absent = keep current/default. */
export interface TurnPin {
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
  /**
   * The turn's execution mode ("plan" = read-only + planning overlay, "auto" =
   * Autopilot). Rides the per-turn pin ONLY — never `Settings` — so an unpinned
   * turn is always "execute". A flip from the live session's mode rebuilds it.
   */
  mode?: TurnMode | null;
}

/**
 * A turn's user message, already persisted + announced by `recordUserTurn`, plus
 * the framing inputs `execTurn` still needs. Splitting the record step OUT of
 * `execTurn` is what lets it run BEFORE the workdir lock (chat.ts) — see the note
 * on `recordUserTurn`.
 */
export interface RecordedUserTurn {
  author: MessageAuthor | undefined;
  priorAuthors: ReadonlyArray<MessageAuthor | undefined>;
}

const errMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/**
 * Persist the user's message durably + announce it on the conversation bus, and
 * return the inputs the model-framing decision needs. Called by `runTurn` BEFORE
 * it takes the per-workspace workdir lock: the transcript is a per-conversation
 * file already ordered by `conv.queue`, and never needed the workspace-wide lock
 * (which serializes concurrent FILE mutations BETWEEN conversations). Recording
 * here means a brand-new conversation's message lands on disk — and so is visible
 * to `GET /conversations` + `/messages` — the instant the turn is accepted, even
 * while ANOTHER conversation holds the lock in a stalled provider call. This
 * write used to live inside the lock, so a stalled routine hid the user's next
 * message (404, empty chat) for as long as it hung.
 */
export function recordUserTurn(
  conv: Conversation,
  id: string,
  turnId: string,
  text: string,
  nonce?: string,
  acting?: ActingContext,
  displayText?: string,
  mentions?: ChatMessage["mentions"],
): RecordedUserTurn {
  // Stamp the executing turn's id up front so a cancel/stop settles this turn.
  conv.turnId = turnId;
  // WHO wrote this message (C5): decode the acting-as token's payload (the
  // gateway already verified it; the runtime only reads it). Absent → no author,
  // and everything below stays byte-identical to a single-user turn.
  const author = decodeActingAuthor(acting?.actingAs);
  // Prior user authors, read BEFORE appending this turn — drives the model
  // framing decision (prefix only when ≥2 distinct authors are in play).
  // Authorless turns (single-user desktop) can never frame (shouldFrame is
  // false without an author), so skip re-reading + parsing the whole
  // conversation file every turn and pass the empty list it would reduce to.
  const priorAuthors = author
    ? (getHistory(id)?.messages ?? [])
        .filter((m) => m.role === "user")
        .map((m) => m.author)
    : [];

  // `text` is what the model receives; `displayText` (when given) is only what
  // the bubble renders on a history reload — the two are stored side by side.
  // `mentions` is the @mention sidecar (HOU-944): the model already sees the
  // names as plain text inside `text`, so this only travels so a reader can map
  // "@Name" back to a person. Persisted AND published, exactly like `author`.
  appendUserMessage(id, text, { author, turnId, displayText, mentions });
  publish(id, {
    type: "user",
    data: { content: text, ts: Date.now(), nonce, author, mentions },
    turnId,
  });
  return { author, priorAuthors };
}

/**
 * Execute one turn: run the model, record the assistant reply durably, and
 * publish every event to the conversation's bus. The user message is already
 * persisted + announced (`recordUserTurn`, run before the workdir lock).
 * Self-contained: any failure is published as an `error`/`provider_error` and
 * never rethrown, so the per-conversation queue survives.
 */
export async function execTurn(
  conv: Conversation,
  id: string,
  turnId: string,
  text: string,
  recorded: RecordedUserTurn,
  pin?: TurnPin,
  acting?: ActingContext,
) {
  const { author, priorAuthors } = recorded;

  let assistantText = "";
  // The turn's reasoning, accumulated for persistence so a history reload can
  // replay it in the mission log (HOU-717) — same lifecycle as assistantText.
  let thinkingText = "";
  let usage: TokenUsage | null = null;
  const tools: ToolCallRecord[] = [];
  // A typed provider failure for this turn. pi resolves the turn rather than
  // throwing, so this arrives on the stream (a provider_error frame), not via the
  // catch. Its presence is also the "the turn failed" signal: persist it on the
  // assistant message (so the inline card survives a reload) AND skip the clean
  // `done` that would settle the chat as a success on top of the error.
  let providerError: ProviderError | undefined;
  // The catch path's typed resolution of a THROWN failure, hoisted so the
  // finally's revoked-token eviction (PRODUCT-1355) can read it — the catch's
  // own `typed` is block-scoped. Streamed failures land in `providerError`.
  let thrownTyped: ProviderError | undefined;
  // Whether THIS turn carried the conversation in as a replay preamble (a
  // consumed `needsSessionReplay` marker or a cross-backend rebuild). Read at
  // the end: a turn that replayed and then failed without a reply must re-arm
  // the marker on a backend that persists nothing from a failed prompt.
  let replayedHistory = false;

  // Stall watchdog: a provider stream that goes silent mid-turn resolves neither
  // success nor error and would hold the workdir lock until the socket dies.
  // When it trips, `stalled` turns the aborted (contentless) turn into a typed
  // error below — see stall-watchdog.ts. Fed every wire event by the
  // subscription; armed/disarmed around the model round-trip only.
  let stalled = false;
  const watchdog = createStallWatchdog({
    timeoutMs: config.turnStallTimeoutMs,
    onStall: () => {
      stalled = true;
      // Fire-and-forget: the awaited prompt() resolves once pi unwinds the
      // aborted stream; that resolution, not this call, advances the turn.
      void conv.session.abort();
    },
  });

  // Subscribes THIS turn's session once it is settled on the correct backend
  // (a cross-backend switch below rebuilds `conv.session`, so the subscription
  // must attach to the final session, not the one we entered with). Undefined
  // until then; the finally guards on it.
  let unsub: (() => void) | undefined;
  // The backend's raw liveness feed, alongside the wire subscription. The wire
  // stream alone starves the watchdog: a tool call's input streams as deltas
  // that map to no WireEvent, so a model writing a large file (a 60 KB bash
  // heredoc, 30k+ output tokens) was wire-silent past the stall window and got
  // aborted mid-generation as "stopped responding" (PRODUCT-1632, Bedrock).
  let unsubLiveness: (() => void) | undefined;
  const subscribeSession = () => {
    unsubLiveness = conv.session.subscribeLiveness?.(() => watchdog.touch());
    unsub = conv.session.subscribe((wire: WireEvent) => {
      if (wire.type === "text") assistantText += wire.data;
      else if (wire.type === "thinking") thinkingText += wire.data;
      else if (wire.type === "usage") usage = wire.data;
      else if (wire.type === "tool_start")
        tools.push({ name: wire.data.name, input: wire.data.args });
      else if (wire.type === "tool_end") {
        const t = tools[tools.length - 1];
        if (t) {
          t.isError = wire.data.isError;
          // Already clipped at the backend — persist for reload replay.
          if (wire.data.content) t.result = wire.data.content;
        }
      } else if (wire.type === "provider_error") providerError = wire.data;
      // Every event proves the provider is alive → reset the stall clock (the
      // watchdog suspends itself while a tool runs and re-arms when it ends).
      watchdog.onEvent(wire);
      publish(id, { ...wire, turnId });
    });
  };

  // Set inside the try when this turn crosses a provider boundary or compacts
  // a near-full context; declared out here so the error path can still persist
  // the markers on the partial message.
  let providerSwitch: ChatMessage["providerSwitch"];
  let compaction: ChatMessage["compaction"];
  /**
   * The provider this turn actually resolved onto — the only honest label for a
   * throw. `conv.provider` is the CACHED session's LAST provider (written only
   * at conversation build, a backend switch, or after a successful `setModel`
   * below), so a turn that throws before that write would be attributed to
   * whatever provider the conversation happened to be created on: a GPT-5.6
   * user got a "Connect Gemini" card, and — worse — the auth-failure mark and
   * the revoked-token report below would fire on an innocent provider.
   * Undefined ONLY when `resolveModel` itself failed, in which case the turn
   * ran on nothing and must name no provider.
   */
  let turnProvider: string | undefined;
  /**
   * The model id the turn RESOLVED onto — the twin of `turnProvider` for the
   * catch's classification. A thrown failure after resolution (pi's manual
   * `compact()` rejecting with "Summarization failed: …" on the active model)
   * used to be classified with the PIN's model only, which an unpinned chat
   * never carries: the model-keyed branches (NVIDIA's per-account gate needs a
   * model to name on the switch-model card) fell through to `unknown`, and
   * the log line read `model=?` (PRODUCT-1636). Undefined ONLY when
   * `resolveModel` itself threw, where the pin is the next-best evidence.
   */
  let turnModel: string | undefined;
  /**
   * WHO a failed turn names when `resolveModel` never returned a provider. The
   * turn's PIN is the next-best evidence: it is the user's (or the routine's)
   * own statement of what this turn was to run on, so a routine pinned to
   * `openai-codex` whose saved model id went stale still gets a card that names
   * Codex instead of a blank. Canonicalized exactly as `resolveModel` would have
   * (`openai` → `openai-codex`), so every consumer keys on the same id.
   * `fallback` is what remains when the turn carried no pin either — and it
   * differs by call site, see each below.
   */
  const attributedProvider = (fallback: string) =>
    turnProvider ??
    (pin?.provider ? canonicalPinProvider(pin.provider) : fallback);
  /**
   * WHICH access token this turn's provider requests ran on, recorded by the
   * credential store at pi's request-time read (auth/used-token.ts,
   * PRODUCT-1319). Held OUTSIDE the prompt's async subtree so the catch — which
   * runs after that subtree unwinds — can still name the failed token when it
   * reports a revocation. Fresh per turn: the fresh instance is the reset.
   */
  const usedTokens = newUsedTokenCapture();
  try {
    // Resolve the model for THIS turn from current settings (a routine's
    // provider/model pin wins, else the workspace's active provider/model).
    // Re-resolved every turn so a mid-conversation provider/model switch —
    // which the web picker applies via setSettings, NOT a per-turn field —
    // actually takes effect on the cached session instead of silently
    // continuing on the model it was built with; and so a pinned routine keeps
    // firing on ITS provider no matter what other chats picked in between.
    // A bad model id throws here → surfaces as the turn's error event.
    const model = resolveModel(pin?.model, pin?.provider);
    // From here on, EVERY failure of this turn belongs to this provider — the
    // canonical id (resolveModel already applied canonicalPinProvider), so the
    // catch's health mark and revocation report name the row that actually ran.
    turnProvider = model.provider;
    turnModel = model.id;
    // The turn's execution mode: the pin's, else execute. Never inherited from
    // Settings. Routine fire paths pin auto; an actually unpinned turn is execute.
    // Held in a MUTABLE ref: a mid-turn Mode-pill switch (`POST
    // /conversations/:id/mode`) reaches it through `conv.liveMode` and the
    // running turn's tools adopt the new mode at their next decision point.
    const liveMode: TurnModeRef = { current: pin?.mode ?? DEFAULT_TURN_MODE };
    conv.liveMode = liveMode;
    const mode = liveMode.current;
    const providerChanged = model.provider !== conv.provider;
    const modelChanged = model.id !== conv.model;
    // COMPLIANCE GATE: when this turn's model crosses a BACKEND boundary
    // (openai/pi → anthropic/Claude SDK, or the reverse), REBUILD the session on
    // the correct backend rather than `setModel` a foreign model into the live
    // one — the harness-spoofing route the whole backend seam exists to prevent.
    // A same-backend change falls through to the cheap `setModel` fast path below.
    // The rebuild lands directly on `mode`, so a switch that also flips mode is a
    // single rebuild and `switchModeIfNeeded` below then no-ops.
    const { rebuilt, preTokens: rebuiltPreTokens } =
      await switchBackendIfNeeded(conv, id, model, mode);
    // MODE FLIP: a plan⇄execute change on the SAME backend rebuilds the session
    // read-only (or back). History rehydrates from disk; no provider_switched
    // frame (same provider/model). No-op when the mode is unchanged — including
    // right after a cross-backend rebuild that already landed on `mode`.
    await switchModeIfNeeded(conv, id, model, mode);
    // Attach the turn's listeners to the SETTLED session (the rebuilt one when we
    // crossed a backend or flipped mode, else the session we entered with).
    subscribeSession();
    // Set on a cross-backend rebuild: the canonical transcript rendered as a
    // preamble, prepended to THIS turn's prompt so the fresh session continues
    // the conversation instead of greeting the user anew (HOU-951).
    let replayPrefix = "";
    // One-shot marker a transcript truncation stamped (edit-and-resend,
    // PRODUCT-1217): the backend-native sessions were deleted with the cut, so
    // this fresh session must carry the kept transcript in as a replay.
    // Consumed unconditionally BEFORE the branch — a cross-backend rebuild on
    // the same turn replays anyway, and a still-set marker would replay a
    // second copy on the turn after.
    const sessionWasReset = consumeSessionReplay(id);
    replayedHistory = rebuilt || sessionWasReset;
    if (rebuilt) {
      // Cross-backend rebuild: the new backend cannot read the old backend's
      // session store, so the fresh session carries the conversation over via a
      // transcript replay from Houston's canonical store — clamped to the new
      // model's window, newest turns kept (`summarized` reflects a lossy clamp,
      // so the divider stays honest). Announce the boundary either way so the
      // chat draws a divider + resets its window estimate; persisted on the
      // assistant message below for reload.
      const replay = renderReplayPreamble(
        getHistory(id)?.messages ?? [],
        turnId,
        replayCharBudget(
          effectiveModelWindow(
            model.provider,
            model.id,
            model.contextWindow,
            0,
          ),
        ),
      );
      replayPrefix = replay?.text ?? "";
      providerSwitch = {
        provider: model.provider,
        summarized: replay?.truncated ?? false,
        pre_tokens: rebuiltPreTokens,
      };
      publish(id, {
        type: "provider_switched",
        data: providerSwitch,
        turnId,
      });
    } else if (sessionWasReset) {
      // Truncation rebuild on the SAME backend: replay the kept transcript
      // into the fresh session. No provider_switched frame — the provider did
      // not change, so the chat draws no divider; the "reset" header keeps the
      // preamble from claiming a model switch that never happened.
      const replay = renderReplayPreamble(
        getHistory(id)?.messages ?? [],
        turnId,
        replayCharBudget(
          effectiveModelWindow(
            model.provider,
            model.id,
            model.contextWindow,
            0,
          ),
        ),
        "reset",
      );
      replayPrefix = replay?.text ?? "";
    } else if (providerChanged || modelChanged) {
      // The leaving provider's last context fill, captured BEFORE the switch so
      // a PROVIDER change can be sized against the new model's window.
      const preTokens = providerChanged
        ? (conv.session.getContextUsage()?.tokens ?? null)
        : null;
      // Re-point the live session; pi keeps the full message history and swaps
      // only the model (same backend — a same-backend cross-provider change,
      // e.g. openai→google, both ride pi).
      await conv.session.setModel(model);
      if (providerChanged) {
        // Mid-session PROVIDER switch. Carry the conversation verbatim when it
        // comfortably fits the new model's window (replay); otherwise compact it
        // first so it fits — pi summarizes with the now-active target model.
        // Size the target window with Houston's effective rule (same as the bar),
        // not pi's raw registry number; observed usage on the fresh target is 0,
        // so it starts at the default — matching the frontend's peak reset on a
        // provider switch.
        const targetWindow = effectiveModelWindow(
          model.provider,
          model.id,
          model.contextWindow,
          0,
        );
        let summarized = false;
        if (switchNeedsCompaction(preTokens, targetWindow)) {
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
        publish(id, {
          type: "provider_switched",
          data: providerSwitch,
          turnId,
        });
      }
      conv.provider = model.provider;
      conv.model = model.id;
    }
    // AUTOCOMPACT: when the session's context is nearly full, summarize +
    // reseed BEFORE this turn so long chats keep working — a guarantee every
    // surface inherits, owned here because the runtime holds the ground truth
    // (live fill + the active model's window). Skipped when a provider switch
    // above already summarized (nothing left to compact) — the fill is read
    // from the SETTLED session, so a rebuilt/fresh session reads low and
    // never re-compacts.
    if (!providerSwitch?.summarized) {
      const fill = conv.session.getContextUsage()?.tokens ?? null;
      // Divide by Houston's EFFECTIVE window (default, snapping up to the ceiling
      // once observed fill proves the larger plan/credit-gated window is active),
      // the SAME denominator the frontend context bar uses — so the runtime
      // compacts a 200k-real Claude chat pi reports as 1M, and does NOT
      // needlessly compact a Gemini chat pi under-reports as 128k.
      const window = effectiveModelWindow(
        model.provider,
        model.id,
        model.contextWindow,
        fill ?? 0,
      );
      if (needsAutocompact(fill, window)) {
        await conv.session.compact();
        compaction = { trigger: "proactive", pre_tokens: fill };
        // Stream the boundary so the chat draws the divider + resets its
        // window estimate; persisted on the assistant message below so the
        // divider survives a history reload.
        publish(id, { type: "context_compacted", data: compaction, turnId });
      }
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
    // Model framing (C5): in a multiplayer conversation with ≥2 distinct authors,
    // prefix the prompt with `[From: <name>]\n` so the model can tell teammates
    // apart. Single-author (or authorless) turns pass `text` through unchanged —
    // today's prompts stay byte-identical, so no drift for existing users.
    // The replay prefix rides the prompt (not the transcript): the user's
    // recorded message stays `text`, so the bubble never renders the preamble,
    // while the backend-native session persists it — later rehydrates keep the
    // carried context without replaying again.
    const promptText = replayPrefix + framePrompt(text, author, priorAuthors);
    // Snapshot the workspace's user-visible files so the turn's diff can be
    // surfaced as a `file_changes` frame below. Same-workdir turns are
    // serialized by the workdir lock (chat.ts), so the diff is attributable to
    // exactly this turn. Best-effort: a snapshot failure only loses the
    // summary, never the turn.
    let beforeFiles: FileSnapshot | null = null;
    try {
      beforeFiles = snapshotWorkspace(config.workspaceDir);
    } catch (err) {
      console.warn("[turn] file snapshot failed:", errMessage(err));
    }
    // A fresh, per-turn holder for whatever the model ends up waiting on the
    // user for (ask_user / request_connection). Fresh every turn IS the reset;
    // established for the DURATION of the prompt (like the acting context) so
    // the tools, running inside this async subtree, record into THIS turn's
    // holder. Read after prompt() resolves and attached to the clean `done`.
    const interaction = newInteractionHolder();
    // Hold the turn's acting-as identity (C2) for the DURATION of the prompt so
    // the integration tools' proxy calls (which run inside this async subtree)
    // attach it. Absent → runs plainly (act as owner). The watchdog covers the
    // model round-trip only — tools run inside prompt() and re-arm/suspend it as
    // they start/end; the finally disarms it whether prompt() resolves or throws.
    watchdog.arm();
    try {
      await runWithActingContext(acting, () =>
        runWithConversationId(id, () =>
          runWithTurnMode(liveMode, () =>
            runWithTurnModel(
              { provider: model.provider, model: model.id },
              () =>
                runWithInteractionCapture(interaction, () =>
                  // The used-token capture spans the prompt so the credential
                  // store's request-time reads record into THIS turn's holder
                  // (auth/used-token.ts, PRODUCT-1319).
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
    // Did the user STOP this turn? cancelTurn marks `conv.stoppedTurnId` before
    // aborting, and pi routes the aborted turn down the usage path (prompt()
    // resolves clean, no provider_error), so this marker is the only trace. Used
    // below to stamp the persisted message `stopped: true` (so the stop survives
    // a reload) and to skip the clean `done`. Cleared with `conv.turnId` in the
    // finally.
    const stopped = conv.stoppedTurnId === turnId;
    // A stall-abort resolves prompt() the same way a user Stop does (pi marks it
    // "aborted" and emits no provider_error), so synthesize the typed failure
    // here — else the empty, contentless turn would settle below as a clean
    // success. `provider_internal` is the honest card: the request DID reach the
    // provider (the socket was live) and it then failed to deliver — a
    // provider-side fault, "try again in a moment", NOT the user's connectivity.
    // No HTTP status: the stream went silent, it never returned a response code.
    // A user STOP always wins over the watchdog: if the same turn was both
    // stalled and stopped, cancelTurn's "Stopped by user" frame is the terminal
    // surface — synthesizing a provider error on top would double-settle the turn
    // (a red card over the neutral stop). So skip the synthesis when stopped.
    if (stalled && !providerError && !stopped) {
      providerError = {
        kind: "provider_internal",
        provider: model.provider,
        http_status: null,
        message: `The AI provider stopped responding (no response for ${Math.round(
          config.turnStallTimeoutMs / 1000,
        )}s). Please try again.`,
      };
      publish(id, { type: "provider_error", data: providerError, turnId });
    }
    // A context-overflow rejection names the model's REAL window (llama.cpp's
    // `n_ctx`). For a custom endpoint — whose window Houston can only assume —
    // persist it, so the next turn's autocompact divides by the truth and the
    // conversation compacts instead of overflowing again.
    if (
      providerError?.kind === "context_overflow" &&
      model.provider === OPENAI_COMPATIBLE &&
      providerError.context_window_tokens
    )
      learnCustomContextWindow(providerError.context_window_tokens);
    // Diff what this turn created/modified. Skipped on a failed turn — a
    // provider error means the model never finished, so attributing partial
    // writes would be noise (mirrors the Rust engine's error gate).
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
    // Persist the switch marker AND any typed provider error on this turn's
    // assistant message so both the boundary divider and the reconnect /
    // rate-limit card survive a history reload. A provider failure lands HERE
    // (pi resolves the turn, it does not throw) with empty text, not in the catch.
    // Models occasionally write a complete plan but omit the final tool call.
    // A clean plan turn with visible assistant output must always leave the user
    // an approval path. Recorded interactions still win (including ask_user).
    // Check the LIVE mode too: a mid-turn execute→plan flip tells the model to
    // lay out a plan while its execute-built toolset has no plan_ready at all,
    // so the backstop is the ONLY way that flow gets its approval card.
    const pendingInteraction =
      !providerError &&
      !stopped &&
      (mode === "plan" || liveMode.current === "plan") &&
      assistantText.trim() &&
      !interaction.pending
        ? planReadyFallback()
        : interaction.pending;
    // The replay rode a prompt the model never answered. pi's session store
    // keeps that prompt (the preamble is already in its history, so the next
    // turn must NOT replay again); the Claude SDK persists nothing for a failed
    // prompt, so without the marker the next attempt would start blank — the
    // rate-limited first turn of a copied chat, then "what was my first
    // message?" answered as if new.
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
      // Durable "stopped by user" marker: it exists so the stop survives a
      // reload — the SDK renders the standard stopped line from `stopped: true`
      // and settles the reload derivation to `needs_you`, fixing the old
      // divergence where settle-from-history re-derived a stopped turn as a
      // clean `done` (pi resolves the aborted turn clean, leaving no trace).
      stopped: stopped ? true : undefined,
      // Persist what the turn ended on under the SAME condition that puts it on
      // the clean `done` frame below (no provider error) — so a client that
      // misses the live `done` still renders that question/connect card (or
      // clean-finish offer) when it settles from history, instead of showing a
      // bare finish. A failed/stalled turn (providerError set) never carries it; a
      // stopped turn never carries it either — the user walked away mid-ask, so
      // nothing should re-render a card.
      pendingInteraction:
        providerError || stopped ? undefined : pendingInteraction,
      turnId,
    });
    // Fold this turn's token usage into the local spend ledger — the usage
    // surface for API-key providers with no account API to probe (Gemini,
    // Bedrock, OpenCode, custom endpoints). Recorded for every provider; the
    // usage endpoint decides which rows serve it. Never fails the turn.
    if (usage) recordTokenSpend(model.provider, usage);
    if (fileChanges)
      publish(id, { type: "file_changes", data: fileChanges, turnId });
    // Skip the clean `done` when the turn failed: the provider_error frame is the
    // turn's terminal surface (the web adapter settles on it), and a `done` would
    // settle the chat as a clean success — firing the "mission complete"
    // notification on top of the error. Also skip it when the user STOPPED the
    // turn: cancelTurn's live "Stopped by user" error frame is the terminal
    // surface, and a `done` on top would race the client's settle. On the
    // clean-done path, carry whatever the turn ended on (a question / connect,
    // or a clean-finish offer) so the card can render it. The status itself does
    // NOT depend on it: every clean settle lands `needs_you`, since only the
    // user ever moves a mission to done. Only the clean done ever carries it.
    if (!providerError && !stopped) {
      // A completed turn proves this provider's credential works — heal any
      // stale turn-failure mark so status reads connected again
      // (auth/credential-health.ts; covers the macOS Keychain re-login no
      // fingerprint can observe).
      clearProviderMarks(model.provider);
      publish(id, {
        type: "done",
        data: null,
        turnId,
        ...(pendingInteraction ? { pendingInteraction } : {}),
      });
    }
    // Report the terminal board state to the host: applied ONLY to
    // agent-started missions (which may have no client observing this
    // conversation to settle their card); a no-op for everything else. Mirrors
    // the client settle: clean/stopped → needs_you, streamed failure → error,
    // and only the clean finish carries the interaction.
    reportMissionSettle(
      id,
      providerError ? "error" : "needs_you",
      providerError || stopped ? null : (pendingInteraction ?? null),
    );
  } catch (err) {
    // Persist the failure even when nothing streamed: a thrown turn (bad pin,
    // missing credential, stale model id) must leave the same durable trace a
    // provider_error frame does — an unattended reader (a routine's reconcile)
    // reads the real reason off this message instead of timing the run out
    // with a vague error 15 minutes later.
    //
    // Classify the throw before falling back to `unknown`: pi RAISES a
    // missing/expired credential at prompt time ("No API key found for
    // <provider>. Use /login …"), before any stream exists, so this catch is
    // the only place it can become the typed reconnect card (HOU-718). A
    // recognized kind is published as a provider_error frame — the turn's
    // terminal surface, same as the streamed path — so the live chat renders
    // the card (and auto-continues after reconnect) instead of raw error
    // text. An unrecognized throw keeps the generic error frame.
    const attributedModel = turnModel ?? pin?.model ?? null;
    const thrown =
      providerError ??
      (err instanceof ModelNotOfferedError ? err.providerError : null) ??
      classifyProviderError({
        // The provider the turn RESOLVED onto, never the cached session's last
        // one; else the turn's pin. Empty only when neither exists: "provider
        // unknown" is the established shape for a TYPED card (chat.ts's
        // pre-session failure emits it too — the client repairs the label from
        // the error's own evidence), and it renders the generic "connect an AI
        // provider" card rather than naming a provider this turn never reached.
        provider: attributedProvider(""),
        model: attributedModel,
        message: errMessage(err),
      });
    // The streamed path logged when it classified; a THROWN failure only
    // becomes visible to Sentry if this catch logs it too — before this,
    // every thrown `unknown` was a card in a user's chat that we never heard
    // about (HOU-1156).
    if (!providerError) logProviderError(thrown, { model: attributedModel });
    // An auth throw with NOTHING streamed = pi's prompt-time credential guard,
    // which raises BEFORE recording the user message in pi's session store —
    // neither the live context nor a rebuild will ever see it. Carry the text
    // on the card so the reconnect retry re-delivers it to the model.
    if (
      thrown.kind === "unauthenticated" &&
      !providerError &&
      !assistantText &&
      tools.length === 0
    )
      thrown.undelivered_prompt = text;
    // A thrown auth failure never crossed the backends' streamed-error seams,
    // so feed it into the status surface here — e.g. a refresh-bearing entry
    // whose refresh token was rejected raises at prompt time, before any
    // stream exists (auth/credential-health.ts).
    // Guarded on a NAMED provider: a throw from resolveModel itself carries the
    // empty id, and marking "" unusable (or POSTing a revocation for it) would
    // corrupt the status surface with a provider that does not exist.
    if (
      thrown.kind === "unauthenticated" &&
      !providerError &&
      thrown.provider
    ) {
      noteAuthFailure(canonicalPinProvider(thrown.provider));
      // A REVOKED served token is invisible to the control plane (HOU-952).
      // Named by the token the turn's requests actually ran on; a throw
      // BEFORE any request read a credential (pi's prompt-time guard, a bad
      // pin) recorded nothing, and the reporter then skips — the turn ran on
      // no served token, so there is nothing safe to delete (PRODUCT-1319).
      reportRevokedServedToken(thrown, usedTokens.digestFor(thrown.provider));
    }
    // Same feed for the OTHER credential-level wall a thrown failure can hit:
    // the account is out of credits, which is not a reconnect (the credential
    // is valid) and must not read as Connected either.
    if (thrown.kind === "quota_exhausted" && !providerError && thrown.provider)
      noteQuotaExhausted(
        canonicalPinProvider(thrown.provider),
        thrown.resets_at,
      );
    const typed = thrown.kind !== "unknown" ? thrown : undefined;
    thrownTyped = typed;
    // The thrown twin of the re-arm above: a replayed turn that died before
    // any reply leaves the Claude SDK with no persisted prompt to resume.
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
        // The UNKNOWN card interpolates this word into its copy ("we could not
        // classify this <provider> error") and into the bug-report id, so an
        // empty string leaves a double space and a dangling
        // `provider_error:unknown:` — hence "unknown" rather than "" here, the
        // same choice chat.ts makes for its pre-session unknown failure.
        kind: "unknown",
        provider: attributedProvider("unknown"),
        raw_excerpt: errMessage(err),
      },
      turnId,
    });
    if (typed && !providerError)
      publish(id, { type: "provider_error", data: typed, turnId });
    else if (!typed)
      publish(id, {
        type: "error",
        data: { message: errMessage(err) },
        turnId,
      });
    // The thrown-failure twin of the clean path's report above: an
    // agent-started mission's card must reach `error` even with no client
    // observing this conversation.
    reportMissionSettle(id, "error", null);
  } finally {
    conv.turnId = undefined;
    // Retire the live-mode ref with the turn: a Mode-pill switch between turns
    // has nothing to apply to (the next turn's pin carries it instead).
    conv.liveMode = undefined;
    // Clear the stop marker alongside the turn id so it never bleeds into the
    // next turn on this conversation (read above to stamp `stopped`).
    conv.stoppedTurnId = undefined;
    // Never leak the stall timer past the turn (no-op if it threw before arming).
    watchdog.disarm();
    // Undefined only if resolveModel/switchBackendIfNeeded threw before we
    // subscribed (a bad pin) — nothing to tear down in that case.
    unsub?.();
    unsubLiveness?.();
    // PRODUCT-1355 (layer 3): a turn that died on a REVOKED token leaves a
    // Claude session whose next spawn would 401 identically — evict it so the
    // user's next attempt after reconnecting rebuilds on the fresh credential.
    // History is on disk; only the in-memory session is disposed. The guard
    // itself scopes this to the Claude backend + `token_revoked`, and defers
    // while other turns are still queued on this conversation.
    evictClaudeSessionOnRevokedToken(
      conversations,
      id,
      conv,
      thrownTyped ?? providerError,
    );
  }
}

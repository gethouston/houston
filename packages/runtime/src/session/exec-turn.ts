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
import { classifyProviderError } from "../ai/provider-error";
import { activeEffort, resolveModel } from "../ai/providers";
import { config } from "../config";
import {
  appendAssistantMessage,
  appendUserMessage,
  getHistory,
} from "../store/conversations";
import { type ActingContext, runWithActingContext } from "./acting-context";
import {
  decodeActingAuthor,
  framePrompt,
  type MessageAuthor,
} from "./attribution";
import { needsAutocompact } from "./autocompact";
import { publish } from "./bus";
import {
  type Conversation,
  switchBackendIfNeeded,
  switchModeIfNeeded,
} from "./conversation-cache";
import {
  diffSnapshots,
  type FileSnapshot,
  snapshotWorkspace,
} from "./file-changes";
import { newInteractionHolder, runWithInteractionCapture } from "./interaction";
import { switchNeedsCompaction } from "./provider-switch";
import { createStallWatchdog } from "./stall-watchdog";

/** A routine's pinned provider/model/effort for this turn. Absent = keep the session's current. */
export interface TurnPin {
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
  /**
   * The turn's execution mode ("plan" = read-only + planning overlay). Rides the
   * per-turn pin ONLY — never `Settings` — so an unpinned turn is always
   * "execute". A flip from the live session's mode rebuilds the session.
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

  appendUserMessage(id, text, { author, turnId });
  publish(id, {
    type: "user",
    data: { content: text, ts: Date.now(), nonce, author },
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
  const subscribeSession = () => {
    unsub = conv.session.subscribe((wire: WireEvent) => {
      if (wire.type === "text") assistantText += wire.data;
      else if (wire.type === "thinking") thinkingText += wire.data;
      else if (wire.type === "usage") usage = wire.data;
      else if (wire.type === "tool_start")
        tools.push({ name: wire.data.name, input: wire.data.args });
      else if (wire.type === "tool_end") {
        const t = tools[tools.length - 1];
        if (t) t.isError = wire.data.isError;
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
    // The turn's execution mode: the pin's, else execute. Never inherited from
    // Settings — an unpinned turn (incl. every routine + cloud turn) is execute.
    const mode = pin?.mode ?? DEFAULT_TURN_MODE;
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
    if (rebuilt) {
      // Cross-backend rebuild: the new session starts fresh (no in-memory history
      // to compact — each backend owns its own store), so nothing is summarized.
      // Still announce the boundary so the chat draws a divider + resets its
      // window estimate; persisted on the assistant message below for reload.
      providerSwitch = {
        provider: model.provider,
        summarized: false,
        pre_tokens: rebuiltPreTokens,
      };
      publish(id, {
        type: "provider_switched",
        data: providerSwitch,
        turnId,
      });
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
    const promptText = framePrompt(text, author, priorAuthors);
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
        runWithInteractionCapture(interaction, () =>
          conv.session.prompt(promptText),
        ),
      );
    } finally {
      watchdog.disarm();
    }
    // A stall-abort resolves prompt() the same way a user Stop does (pi marks it
    // "aborted" and emits no provider_error), so synthesize the typed failure
    // here — else the empty, contentless turn would settle below as a clean
    // success. `provider_internal` is the honest card: the request DID reach the
    // provider (the socket was live) and it then failed to deliver — a
    // provider-side fault, "try again in a moment", NOT the user's connectivity.
    // No HTTP status: the stream went silent, it never returned a response code.
    if (stalled && !providerError) {
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
    appendAssistantMessage(id, assistantText, {
      tools,
      thinking: thinkingText || undefined,
      usage,
      providerSwitch,
      compaction,
      providerError,
      fileChanges,
      // Persist what the turn is waiting on the user for under the SAME
      // condition that puts it on the clean `done` frame below (no provider
      // error) — so a client that misses the live `done` settles from history
      // to `needs_you`, never dropping the question/connect card to a false
      // `done`. A failed/stalled turn (providerError set) never carries it.
      pendingInteraction: providerError ? undefined : interaction.pending,
      turnId,
    });
    if (fileChanges)
      publish(id, { type: "file_changes", data: fileChanges, turnId });
    // Skip the clean `done` when the turn failed: the provider_error frame is the
    // turn's terminal surface (the web adapter settles on it), and a `done` would
    // settle the chat as a clean success — firing the "mission complete"
    // notification on top of the error. On the clean-done path, carry whatever
    // the model is now waiting on the user for so the board card settles to
    // `needs_you` (absent → `done`). Only the clean done ever carries it.
    if (!providerError)
      publish(id, {
        type: "done",
        data: null,
        turnId,
        ...(interaction.pending
          ? { pendingInteraction: interaction.pending }
          : {}),
      });
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
    const thrown =
      providerError ??
      classifyProviderError({
        provider: pin?.provider ?? conv.provider,
        model: pin?.model ?? null,
        message: errMessage(err),
      });
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
    const typed = thrown.kind !== "unknown" ? thrown : undefined;
    appendAssistantMessage(id, assistantText, {
      tools,
      thinking: thinkingText || undefined,
      usage,
      providerSwitch,
      compaction,
      providerError: typed ?? {
        kind: "unknown",
        provider: pin?.provider ?? conv.provider,
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
  } finally {
    conv.turnId = undefined;
    // Never leak the stall timer past the turn (no-op if it threw before arming).
    watchdog.disarm();
    // Undefined only if resolveModel/switchBackendIfNeeded threw before we
    // subscribed (a bad pin) — nothing to tear down in that case.
    unsub?.();
  }
}

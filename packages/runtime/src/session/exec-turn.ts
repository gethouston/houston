import type {
  ChatMessage,
  ProviderError,
  TokenUsage,
  ToolCallRecord,
  WireEvent,
} from "@houston/runtime-client";
import { DEFAULT_REASONING_EFFORT, toThinkingLevel } from "../ai/effort";
import { activeEffort, resolveModel } from "../ai/providers";
import { config } from "../config";
import {
  appendAssistantMessage,
  appendUserMessage,
  getHistory,
} from "../store/conversations";
import { type ActingContext, runWithActingContext } from "./acting-context";
import { decodeActingAuthor, framePrompt } from "./attribution";
import { publish } from "./bus";
import type { Conversation } from "./conversation-cache";
import {
  diffSnapshots,
  type FileSnapshot,
  snapshotWorkspace,
} from "./file-changes";
import { switchNeedsCompaction } from "./provider-switch";

/** A routine's pinned provider/model/effort for this turn. Absent = keep the session's current. */
export interface TurnPin {
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
}

const errMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

/**
 * Execute one turn: record the user + assistant messages durably and publish
 * every event to the conversation's bus. Self-contained: any failure is published
 * as an `error` event and never rethrown, so the per-conversation queue survives.
 */
export async function execTurn(
  conv: Conversation,
  id: string,
  turnId: string,
  text: string,
  nonce?: string,
  pin?: TurnPin,
  acting?: ActingContext,
) {
  // Every frame and persisted message of this turn carries `turnId`, so a
  // client (resyncing, or watching another writer's turn — a teammate, a
  // second tab, a routine) can attribute what it sees to exactly one turn.
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

  let assistantText = "";
  let usage: TokenUsage | null = null;
  const tools: ToolCallRecord[] = [];
  // A typed provider failure for this turn. pi resolves the turn rather than
  // throwing, so this arrives on the stream (a provider_error frame), not via the
  // catch. Its presence is also the "the turn failed" signal: persist it on the
  // assistant message (so the inline card survives a reload) AND skip the clean
  // `done` that would settle the chat as a success on top of the error.
  let providerError: ProviderError | undefined;

  const unsub = conv.session.subscribe((wire: WireEvent) => {
    if (wire.type === "text") assistantText += wire.data;
    else if (wire.type === "usage") usage = wire.data;
    else if (wire.type === "tool_start") tools.push({ name: wire.data.name });
    else if (wire.type === "tool_end") {
      const t = tools[tools.length - 1];
      if (t) t.isError = wire.data.isError;
    } else if (wire.type === "provider_error") providerError = wire.data;
    publish(id, { ...wire, turnId });
  });

  // Set inside the try when this turn crosses a provider boundary; declared out
  // here so the error path can still persist the marker on the partial message.
  let providerSwitch: ChatMessage["providerSwitch"];
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
    const providerChanged = model.provider !== conv.provider;
    const modelChanged = model.id !== conv.model;
    if (providerChanged || modelChanged) {
      // The leaving provider's last context fill, captured BEFORE the switch so
      // a PROVIDER change can be sized against the new model's window.
      const preTokens = providerChanged
        ? (conv.session.getContextUsage()?.tokens ?? null)
        : null;
      // Re-point the live session; pi keeps the full message history and swaps
      // only the model (cross-provider works — the Model carries its provider).
      await conv.session.setModel(model);
      if (providerChanged) {
        // Mid-session PROVIDER switch. Carry the conversation verbatim when it
        // comfortably fits the new model's window (replay); otherwise compact it
        // first so it fits — pi summarizes with the now-active target model.
        let summarized = false;
        if (switchNeedsCompaction(preTokens, model.contextWindow)) {
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
    // Hold the turn's acting-as identity (C2) for the DURATION of the prompt so
    // the integration tools' proxy calls (which run inside this async subtree)
    // attach it. Absent → runs plainly (act as owner).
    await runWithActingContext(acting, () => conv.session.prompt(promptText));
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
      usage,
      providerSwitch,
      providerError,
      fileChanges,
      turnId,
    });
    if (fileChanges)
      publish(id, { type: "file_changes", data: fileChanges, turnId });
    // Skip the clean `done` when the turn failed: the provider_error frame is the
    // turn's terminal surface (the web adapter settles on it), and a `done` would
    // settle the chat as a clean success — firing the "mission complete"
    // notification on top of the error.
    if (!providerError) publish(id, { type: "done", data: null, turnId });
  } catch (err) {
    // Persist the failure even when nothing streamed: a thrown turn (bad pin,
    // missing credential, stale model id) must leave the same durable trace a
    // provider_error frame does — an unattended reader (a routine's reconcile)
    // reads the real reason off this message instead of timing the run out
    // with a vague error 15 minutes later.
    appendAssistantMessage(id, assistantText, {
      tools,
      usage,
      providerSwitch,
      providerError: providerError ?? {
        kind: "unknown",
        provider: pin?.provider ?? conv.provider,
        raw_excerpt: errMessage(err),
      },
      turnId,
    });
    publish(id, { type: "error", data: { message: errMessage(err) }, turnId });
  } finally {
    conv.turnId = undefined;
    unsub();
  }
}

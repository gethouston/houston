import type { TurnMode } from "@houston/protocol";
import type { ResolvedModel } from "../backends/types";
import { conversationCompactions } from "../store/conversation-compaction";
import { serverBackendFor } from "./conversation-backends";
import type { Conversation } from "./conversation-record";

/**
 * The two mid-conversation rebuilds a cached session can need: moving it to the
 * backend its resolved model requires, and moving it to the execution mode the
 * turn asks for. Both dispose the live session and open a fresh one; the cache
 * itself (conversation-cache.ts) never rebuilds a session for these reasons.
 *
 * The backend is resolved through `serverBackendFor` (conversation-backends.ts),
 * which registers this process's backends on first use — so importing this
 * module on its own is enough to rebuild a session correctly.
 */

/** The backend id the Claude Agent SDK registers under (`backends/claude`). */
const ANTHROPIC_BACKEND_ID = "anthropic";

/**
 * COMPLIANCE GATE: ensure a conversation's live session sits on the backend the
 * resolved model requires, REBUILDING it when a mid-conversation switch crosses a
 * backend boundary (e.g. openai/pi → anthropic/Claude SDK, or the reverse).
 *
 * A foreign model must NEVER be `setModel`'d into the live session — that would
 * forward an anthropic model into pi's in-process Anthropic client (the
 * harness-spoofing request Anthropic blocks) or an openai id through the Claude
 * subprocess. So the old session is disposed and a fresh one opened via the
 * correct backend (`fresh: true` — the new backend must not resume its own
 * stale pre-switch session either, see CreateSessionOptions.fresh). The new
 * session starts without backend-native history — each backend owns its own
 * session store — so exec-turn carries the conversation over by prepending the
 * canonical Houston transcript to the first prompt (HOU-951, see
 * replay-transcript.ts).
 *
 * A same-backend change (pi sonnet→opus, or claude model→model) is left alone —
 * the caller keeps the cheap `setModel` fast path that preserves the live session.
 *
 * Returns `rebuilt: true` with the leaving session's last context fill (for the
 * `provider_switched` frame) when it rebuilt, else `rebuilt: false`.
 */
export async function switchBackendIfNeeded(
  conv: Conversation,
  conversationId: string,
  model: ResolvedModel,
  mode: TurnMode,
): Promise<{ rebuilt: boolean; preTokens: number | null }> {
  const backend = serverBackendFor(model.provider);
  if (backend.id === conv.backendId) return { rebuilt: false, preTokens: null };

  // Leaving the Claude backend retires its armed compaction checkpoint. It is a
  // summary waiting to be prepended to the NEXT anthropic prompt; the history it
  // summarizes is about to be carried into the new backend as a transcript
  // replay instead, so a conversation that later comes back to anthropic would
  // otherwise read the same stretch twice - once replayed, once summarized -
  // with the summary also suppressing the resume of the session it belongs to.
  if (conv.backendId === ANTHROPIC_BACKEND_ID)
    conversationCompactions.clear(conversationId);

  // Capture the leaving provider's context fill BEFORE tearing the session down,
  // so the switch can still be sized against the new model's window downstream.
  const preTokens = conv.session.getContextUsage()?.tokens ?? null;
  conv.session.dispose();
  // Build the new backend's session directly at the requested mode, so a switch
  // that ALSO flips mode lands on it in ONE rebuild — `switchModeIfNeeded` then
  // no-ops (conv.mode is already the requested mode).
  conv.session = await backend.createSession({
    conversationId,
    model,
    mode,
    // Never resume the new backend's own stale pre-switch session: the history
    // arrives as a transcript replay on the first prompt (HOU-951).
    fresh: true,
    // Preserve the conversation's startup context across the rebuild (HOU-711).
    ...(conv.context ? { context: conv.context } : {}),
  });
  conv.backendId = backend.id;
  conv.provider = model.provider;
  conv.model = model.id;
  conv.mode = mode;
  return { rebuilt: true, preTokens };
}

/**
 * Ensure the live session sits in the requested execution mode, REBUILDING it on
 * the SAME backend when the mode flips (execute ⇄ plan). Plan and execute differ
 * in the tool allowlist AND the system prompt — both fixed at session-build time
 * — so a flip cannot be applied to a live session; it is rebuilt.
 *
 * History is NOT lost across the rebuild: the backend reopens THIS conversation's
 * persisted session by id (pi via `SessionManager.continueRecent` on the
 * conversation's dedicated sessions dir; Claude via its `sessions.json` +
 * transcript store keyed by conversationId), so prior turns rehydrate into the
 * fresh session. Nothing is cleared here.
 *
 * A mode flip is INTERNAL — same provider, same model — so it emits NO
 * `provider_switched` frame (unlike a cross-backend switch). No-op when the mode
 * is unchanged, so the common execute→execute turn keeps the live session.
 */
export async function switchModeIfNeeded(
  conv: Conversation,
  conversationId: string,
  model: ResolvedModel,
  mode: TurnMode,
): Promise<{ rebuilt: boolean }> {
  if (conv.mode === mode) return { rebuilt: false };
  conv.session.dispose();
  conv.session = await serverBackendFor(model.provider).createSession({
    conversationId,
    model,
    mode,
    // Preserve the conversation's startup context across the rebuild (HOU-711).
    ...(conv.context ? { context: conv.context } : {}),
  });
  conv.mode = mode;
  return { rebuilt: true };
}

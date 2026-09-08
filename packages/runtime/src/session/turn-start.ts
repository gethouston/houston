import type { ChatMessage } from "@houston/runtime-client";
import { canonicalPinProvider, isProvider } from "../ai/providers";
import {
  logTurnTarget,
  resolveTurnTarget,
  type TurnPinSource,
  turnTargetIsRunnable,
} from "../ai/turn-diagnostic";
import { serveModeOn, syncServedCredentialSafe } from "../auth/serve";
import { config } from "../config";
import type { ActingContext } from "./acting-context";
import { publish } from "./bus";
import { type Conversation, getConversation } from "./conversation-cache";
import { execTurn, recordUserTurn, type TurnPin } from "./exec-turn";
import {
  connectedProviderForTurn,
  pinnedProviderUnavailable,
} from "./provider-gate";
import {
  reportPinnedProviderUnavailable,
  reportTurnStartFailure,
  type TurnStartFailure,
} from "./turn-start-failure";
import { withWorkdirLock } from "./workdir-lock";
import type { ProvidedContext } from "./workspace-context";

/**
 * Sync the workspace's central credential, then report the connected provider (or
 * null). The message route AWAITS this before accepting a turn, so a logged-out /
 * never-connected turn fails the REQUEST — the client surfaces the error at once —
 * instead of starting a fire-and-forget turn whose only failure signal is an
 * `error` event that can race the client's SSE subscribe and get lost, leaving the
 * chat spinning forever after logout.
 */
export async function ensureProviderForTurn(
  pin?: TurnPinSource,
): Promise<string | null> {
  // Connect-once: pull the workspace's current central credential into auth.json
  // so pi uses the user's own token. Best-effort — a transient failure leaves the
  // existing (still-valid) credential; a forgotten connection => activeProvider null.
  await syncServedCredentialSafe("serve");
  // Ground-truth diagnostic, resolved through the PIN (ai/turn-diagnostic.ts):
  // the agent's saved provider is not what a pinned turn runs on, and the log
  // line has to say what the turn actually does. Logged for a pinned turn even
  // when nothing is connected — that turn still runs, and its failure needs a
  // target on the record.
  const target = resolveTurnTarget(pin);
  if (turnTargetIsRunnable(target)) logTurnTarget(target);
  // The AUTH gate is a different question from the diagnostic above: it reports
  // the agent's own connected provider, and the route pairs it with the pin. It
  // waits out an UNSETTLED anthropic signal (provider-gate.ts) rather than
  // failing the request on a cold cache the first probe hasn't answered yet.
  return connectedProviderForTurn();
}

/**
 * Start a turn for a conversation. Turns on the same conversation are
 * serialized (ordered resume). Never rejects — failures surface as `error`
 * events on the conversation's stream.
 */
export async function runTurn(
  id: string,
  text: string,
  nonce?: string,
  pin?: TurnPin,
  acting?: ActingContext,
  context?: ProvidedContext,
  displayText?: string,
  mentions?: ChatMessage["mentions"],
): Promise<void> {
  // Mint the turn's wire identity up front so even a turn that fails before
  // executing (the guards below) terminates under one id.
  const turnId = crypto.randomUUID();
  const failure: TurnStartFailure = {
    id,
    turnId,
    text,
    nonce,
    displayText,
    mentions,
  };
  const canonicalPinnedProvider = pin?.provider
    ? canonicalPinProvider(pin.provider)
    : undefined;
  if (
    serveModeOn() &&
    canonicalPinnedProvider &&
    isProvider(canonicalPinnedProvider) &&
    (await pinnedProviderUnavailable(canonicalPinnedProvider))
  ) {
    reportPinnedProviderUnavailable(failure, canonicalPinnedProvider);
    return;
  }
  // The message route already synced the credential and confirmed a provider via
  // ensureProviderForTurn. Re-check here as a cheap guard for the narrow window
  // where the provider is logged out mid-turn: getConversation returns a CACHED
  // session without re-running resolveModel()'s connect guard, so without this a
  // now-credential-less turn could still reach session.prompt() and hang with no
  // terminal event. Local provider-pinned turns retain their historical bypass.
  // In serve mode the gate above refuses only a definitively absent canonical
  // pinned provider, after the route's served-credential sync has completed.
  if (!pin?.provider && !(await connectedProviderForTurn())) {
    publish(id, {
      type: "error",
      data: { message: "No provider connected. Connect an AI provider first." },
      turnId,
    });
    return;
  }

  let conv: Conversation;
  try {
    conv = await getConversation(id, pin, context);
  } catch (err) {
    reportTurnStartFailure(failure, err, pin);
    return;
  }

  // Two layers of serialization: per-conversation ordering (conv.queue) AND
  // the per-workdir lock — every conversation in this runtime shares ONE
  // workspaceDir, so a routine's turn and a user chat queue instead of
  // mutating the same files concurrently (the Rust engine's workdir_locks
  // behavior). The conv.queue link resolves before the lock is requested, so
  // the two layers can't deadlock.
  // Pin the session against idle/LRU eviction for this turn's whole queued-and-
  // running lifetime — decremented in `finally` when it settles. Without this a
  // turn parked in the queue behind the workdir lock (turnId not yet set) could
  // have its session disposed by a concurrent conversation's eviction sweep.
  conv.pending++;
  const run = conv.queue.then(() => {
    // Persist + announce the user message BEFORE taking the workdir lock, so a
    // brand-new conversation's message is durable and visible (GET /messages)
    // the instant the turn is accepted — even while ANOTHER conversation holds
    // the lock in a stalled provider call. The transcript write is a
    // per-conversation file already ordered by conv.queue; only the turn's
    // file-mutating body needs the workspace-wide lock.
    const recorded = recordUserTurn(
      conv,
      id,
      turnId,
      text,
      nonce,
      acting,
      displayText,
      mentions,
    );
    return withWorkdirLock(config.workspaceDir, () =>
      execTurn(conv, id, turnId, text, recorded, pin, acting),
    );
  });
  // Keep the queue chain alive past a turn. execTurn already surfaces its own
  // failure as an `error` event, so this guard never swallows a user-visible one.
  conv.queue = run.catch(() => {});
  try {
    await run;
  } finally {
    conv.pending--;
  }
}

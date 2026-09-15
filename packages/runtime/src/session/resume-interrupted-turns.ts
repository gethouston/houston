import type { ChatMessage } from "@houston/runtime-client";
import { config } from "../config";
import { type ActingContext, runWithActingContext } from "./acting-context";
import { holdConversationTurn } from "./conversation-command-gate";
import { isDraining as runtimeIsDraining } from "./drain";
import type { TurnPin } from "./exec-turn";
import { encodeResumePrompt } from "./resume-prompt";
import {
  type ResumeProviderProbes,
  resumeProviderReady,
} from "./resume-provider-gate";
import type { ResumeRequest } from "./resume-request";
import { resumeWasRecorded, revokeResume } from "./resume-revoke";
import { actingFromPersisted } from "./turn-resume-info";
import type { ProvidedContext } from "./workspace-context";

/**
 * Running the turns the boot settle judged resumable (PRODUCT-1785).
 *
 * The settle (settle-interrupted-turns.ts) already wrote each interrupted
 * turn's reply and decided WHICH may run again — never a resume of a resume,
 * never a marker from an engine that could not record what a resume needs.
 * This module only re-sends the original prompt, framed so the model knows a
 * restart happened and what survived it (resume-prompt.ts).
 *
 * Fire-and-forget by design: it runs AFTER the server listens (a resume that
 * hung before `listen` would hold the whole engine down). A resume that never
 * starts is not silent, though: the settle already promised the user a
 * continuation, so every failure path here takes that promise back
 * (resume-revoke.ts).
 */

/**
 * How long the resume waits before sending. The credential prime + the first
 * serve sync start at boot and the resumed turn needs them: a send that beat
 * them would fail the provider gate ("No provider connected") on an engine
 * that is perfectly fine seconds later.
 */
export const RESUME_DELAY_MS = 2_000;

export interface ResumeInterruptedTurnsDeps extends ResumeProviderProbes {
  runTurn: (
    id: string,
    text: string,
    nonce: undefined,
    pin: TurnPin | undefined,
    acting: ActingContext | undefined,
    context: ProvidedContext | undefined,
    displayText: undefined,
    mentions: ChatMessage["mentions"] | undefined,
    options: { resumeOf: string },
  ) => Promise<void>;
  log?: (message: string, error: unknown) => void;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Test seams; production wires the runtime's own gates, latch and sync. */
  holdTurn?: (id: string, turn: Promise<void>) => void;
  isDraining?: () => boolean;
  runWithActing?: <T>(acting: ActingContext | undefined, fn: () => T) => T;
  dataDir?: string;
  revoke?: (conversationId: string, turnId: string) => void;
  recorded?: (conversationId: string, prompt: string) => boolean;
}

/**
 * Run every resumable turn once, in order. Never throws and never rejects: the
 * caller is a boot path with no user to answer to.
 *
 * Each turn passes the same gates the HTTP route applies to a client's send:
 * no new turn on a draining runtime (it would only be cut again), a connected
 * provider first (waited for, not refused), and the conversation-command hold
 * so a `/clear` arriving mid-resume is refused instead of disposing the
 * session under the running turn. Crucially it also runs inside the ORIGINAL
 * turn's acting context — the gates and the whole turn read it ambiently
 * (acting-context.ts), and a resume that skipped it would run, and bill, on
 * the team account.
 */
export async function resumeInterruptedTurns(
  requests: readonly ResumeRequest[],
  deps: ResumeInterruptedTurnsDeps,
): Promise<void> {
  if (requests.length === 0) return;
  const log =
    deps.log ??
    ((message: string, error: unknown) => console.error(message, error));
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const holdTurn = deps.holdTurn ?? holdConversationTurn;
  const isDraining = deps.isDraining ?? runtimeIsDraining;
  const runWithActing = deps.runWithActing ?? runWithActingContext;
  const dataDir = deps.dataDir ?? config.dataDir;
  const revoke =
    deps.revoke ??
    ((id: string, turnId: string) => revokeResume(dataDir, id, turnId));
  const recorded =
    deps.recorded ??
    ((id: string, prompt: string) => resumeWasRecorded(dataDir, id, prompt));
  const giveUp = (request: ResumeRequest) => {
    try {
      revoke(request.conversationId, request.turnId);
    } catch (error) {
      log(
        `[turn] resume after restart could not be revoked conversation=${request.conversationId} turn=${request.turnId}`,
        error,
      );
    }
  };
  await sleep(deps.delayMs ?? RESUME_DELAY_MS);
  for (const [index, request] of requests.entries()) {
    const where = `conversation=${request.conversationId} turn=${request.turnId}`;
    if (isDraining()) {
      log(
        `[turn] resume after restart skipped, runtime is draining ${where}`,
        undefined,
      );
      // Nothing after this point starts either, so every turn still holding
      // the settle's promise gives it back — not just this one.
      for (const pending of requests.slice(index)) giveUp(pending);
      return;
    }
    const prompt = encodeResumePrompt(request);
    let started: boolean;
    try {
      started = await runWithActing(actingFromPersisted(request.acting), () =>
        startResume(request, prompt, { deps, holdTurn, sleep }),
      );
    } catch (error) {
      log(`[turn] resume after restart failed ${where}`, error);
      giveUp(request);
      continue;
    }
    if (!started) {
      log(
        `[turn] resume after restart dropped, no provider connected ${where}`,
        undefined,
      );
      giveUp(request);
      continue;
    }
    // `runTurn` refuses a turn it cannot start by resolving normally, so a
    // resolved turn is not yet a started one: the recorded prompt is.
    if (!recorded(request.conversationId, prompt)) {
      log(
        `[turn] resume after restart recorded nothing, the turn was refused ${where}`,
        undefined,
      );
      giveUp(request);
    }
  }
}

interface ResumeRunners {
  deps: ResumeInterruptedTurnsDeps;
  holdTurn: (id: string, turn: Promise<void>) => void;
  sleep: (ms: number) => Promise<void>;
}

/**
 * Start one resume under the caller's acting context and wait it out. Returns
 * false when no provider ever became available — the one non-throwing refusal.
 */
async function startResume(
  request: ResumeRequest,
  prompt: string,
  { deps, holdTurn, sleep }: ResumeRunners,
): Promise<boolean> {
  const ready = await resumeProviderReady(request, deps, sleep);
  if (!ready) return false;
  const turn = deps.runTurn(
    request.conversationId,
    prompt,
    undefined,
    request.pin,
    actingFromPersisted(request.acting),
    request.context,
    undefined,
    request.mentions,
    { resumeOf: request.turnId },
  );
  holdTurn(request.conversationId, turn);
  await turn;
  return true;
}

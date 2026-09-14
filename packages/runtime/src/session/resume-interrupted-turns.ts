import { AUTO_CONTINUE_MARKER } from "@houston/protocol";
import type { ActingContext } from "./acting-context";
import type { TurnPin } from "./exec-turn";
import { actingFromPersisted, type ResumeRequest } from "./turn-resume-info";

/**
 * Running the turns the boot settle judged resumable (PRODUCT-1785).
 *
 * The settle (settle-interrupted-turns.ts) already wrote each interrupted
 * turn's reply and decided WHICH may run again — never a resume of a resume,
 * never a marker from an engine that could not record what a resume needs.
 * This module only re-sends the original prompt, framed so the model knows a
 * restart happened and what survived it.
 *
 * Fire-and-forget by design: it runs AFTER the server listens (a resume that
 * hung before `listen` would hold the whole engine down), and a resume that
 * fails leaves the chat exactly as the settle left it — the pause line is
 * already in the transcript, so the worst case is the old behavior.
 */

/**
 * How long the resume waits before sending. The credential prime + the first
 * serve sync start at boot and the resumed turn needs them: a send that beat
 * them would fail the provider gate ("No provider connected") on an engine
 * that is perfectly fine seconds later.
 */
export const RESUME_DELAY_MS = 2_000;

/**
 * What the model is told when its turn is picked up after a restart. Model-
 * facing English (the engine is prompt-agnostic in language; the USER-facing
 * line is translated in the app), carried as a hidden auto-continue message so
 * no bubble the user never typed appears in the transcript.
 *
 * It names the survivors explicitly because the model cannot see them: the
 * workspace files are on disk, everything the dead process was holding is not.
 * Without that, the model re-ran finished work from the top — the bug this
 * fixes. The original request is quoted in full: the dead process took the
 * provider session with it, so "continue" alone can land on a model that no
 * longer knows what was asked.
 */
export const RESUME_PROMPT_LEAD =
  "A restart interrupted your previous reply while you were working on this request:";

export const RESUME_PROMPT_GUIDANCE = [
  "Files you saved in the workspace survived the restart.",
  "Temporary folders, unfinished installs, and anything you had running did not.",
  "Check what already exists in the workspace before redoing anything, continue from there, and briefly tell the user what was kept and what had to be redone.",
].join(" ");

/** The hidden user message a resume sends: the marker, then the framing. */
export function encodeResumePrompt(request: ResumeRequest): string {
  return [
    AUTO_CONTINUE_MARKER,
    RESUME_PROMPT_LEAD,
    request.text,
    RESUME_PROMPT_GUIDANCE,
  ].join("\n\n");
}

export interface ResumeInterruptedTurnsDeps {
  runTurn: (
    id: string,
    text: string,
    nonce: undefined,
    pin: TurnPin | undefined,
    acting: ActingContext | undefined,
    context: undefined,
    displayText: undefined,
    mentions: undefined,
    acceptedTurnId: undefined,
    options: { resumeOf: string },
  ) => Promise<void>;
  log?: (message: string, error: unknown) => void;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Run every resumable turn once, in order. Never throws and never rejects: the
 * caller is a boot path with no user to answer to.
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
  await sleep(deps.delayMs ?? RESUME_DELAY_MS);
  for (const request of requests) {
    try {
      await deps.runTurn(
        request.conversationId,
        encodeResumePrompt(request),
        undefined,
        request.pin,
        actingFromPersisted(request.acting),
        undefined,
        undefined,
        undefined,
        undefined,
        { resumeOf: request.turnId },
      );
    } catch (error) {
      log(
        `[turn] resume after restart failed conversation=${request.conversationId} turn=${request.turnId}`,
        error,
      );
    }
  }
}

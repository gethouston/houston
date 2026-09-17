import { existsSync } from "node:fs";
import type { ChatMessage } from "@houston/runtime-client";
import { loadConversation } from "../store/conversation-file";
import { isPersonalScope } from "./acting-context";
import type { TurnPin } from "./exec-turn";
import type { InflightTurnMarker } from "./turn-inflight-marker";
import type { PersistedActing } from "./turn-resume-info";
import type { ProvidedContext } from "./workspace-context";

/**
 * The boot decision: WHICH interrupted turn may be run again, and with what
 * (PRODUCT-1785). The persisted half of that decision — what a starting turn
 * writes onto its in-flight marker — lives in turn-resume-info.ts; this module
 * only reads a marker back and answers the settle.
 */

/** One interrupted turn the boot settle decided to run again. */
export interface ResumeRequest {
  conversationId: string;
  /** The interrupted turn's id — the resume turn records it as `resumeOf`. */
  turnId: string;
  /** The model-facing text of the original user message, verbatim. */
  text: string;
  mentions?: ChatMessage["mentions"];
  pin?: TurnPin;
  acting?: PersistedActing;
  context?: ProvidedContext;
}

/**
 * How old an interrupted turn may be and still be run again without anyone
 * asking. A desktop force-quit is a restart too: relaunching the app days
 * later must not quietly spend tokens on last week's task. Two hours covers
 * the long pod turns this exists for (the PRODUCT-1778 render ran 31 minutes
 * before its eviction, plus up to 8 minutes of drain); past it the chat keeps
 * the "say continue" line and the user decides.
 */
export const RESUME_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * The resume request for an interrupted turn, or null when it must not be
 * resumed. Four refusals, each deliberate:
 *
 *  - `resumeOf` set: THIS turn was itself a resume that died. Resuming it
 *    again is the loop — one automatic resume per interrupted turn, ever.
 *  - no `resume` payload: a marker from an engine that predates this, so the
 *    pin and credential scope are unknown and a resume would run on the wrong
 *    model or the wrong account.
 *  - older than RESUME_MAX_AGE_MS: the user has moved on; ask, do not act.
 *  - no user message on disk for the turn id: nothing to say to the model.
 *
 * Plus one disk check: a per-user credential that did not survive the restart
 * (see `credentialSurvived`).
 */
export function resumeRequestFor(
  conversationsDir: string,
  marker: InflightTurnMarker,
  now: number = Date.now(),
): ResumeRequest | null {
  if (marker.resumeOf !== undefined || !marker.resume) return null;
  if (now - marker.startedAt > RESUME_MAX_AGE_MS) return null;
  if (!credentialSurvived(marker.resume.acting)) return null;
  const conv = loadConversation(conversationsDir, marker.conversationId);
  const original = conv?.messages.find(
    (m) => m.role === "user" && m.turnId === marker.turnId,
  );
  if (!original?.content) return null;
  return {
    conversationId: marker.conversationId,
    turnId: marker.turnId,
    text: original.content,
    ...(original.mentions !== undefined ? { mentions: original.mentions } : {}),
    ...(marker.resume.pin ? { pin: marker.resume.pin } : {}),
    ...(marker.resume.acting ? { acting: marker.resume.acting } : {}),
    ...(marker.resume.context ? { context: marker.resume.context } : {}),
  };
}

/**
 * Whether the credential the original turn ran on is still on this disk.
 *
 * A per-user scope resolves to that member's own auth file, and those files
 * are deliberately excluded from the store sync — after a pod move the volume
 * has none of them. Resuming there would run (and bill) on whatever the
 * scope's empty file resolves to, so the turn settles as interrupted instead
 * and the user is asked. The team scope has no such file of its own and the
 * boot serve sync fetches it, so it never refuses here.
 */
function credentialSurvived(acting: PersistedActing | undefined): boolean {
  const key = acting?.credentialScopeKey;
  if (key === undefined || !isPersonalScope(key)) return true;
  return acting?.authPath === undefined || existsSync(acting.authPath);
}

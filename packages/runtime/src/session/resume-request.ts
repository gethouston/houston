import { existsSync } from "node:fs";
import { RESUME_MAX_AGE_MS } from "@houston/domain";
import type { ChatMessage } from "@houston/runtime-client";
import { loadConversation } from "../store/conversation-file";
import { isPersonalScope } from "./acting-context";
import type { TurnPin } from "./exec-turn";
import type { InflightTurnMarker } from "./turn-inflight-marker";
import type { PersistedActing } from "./turn-resume-info";
import type { ProvidedContext } from "./workspace-context";

export interface ResumeRequest {
  conversationId: string;
  turnId: string;
  text: string;
  mentions?: ChatMessage["mentions"];
  pin?: TurnPin;
  acting?: PersistedActing;
  context?: ProvidedContext;
}

export { RESUME_MAX_AGE_MS };

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

function credentialSurvived(acting: PersistedActing | undefined): boolean {
  const key = acting?.credentialScopeKey;
  if (key === undefined || !isPersonalScope(key)) return true;
  return acting?.authPath === undefined || existsSync(acting.authPath);
}

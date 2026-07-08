/**
 * When to show the welcome chat's hardcoded greeting (HOU-713).
 *
 * A welcome mission created THIS app run holds its greeting back for a short
 * "agent is getting ready" beat (`WELCOME_GREETING_DELAY_MS`); a welcome chat
 * reopened later (reload, another device) reveals instantly — the greeting is
 * derived from the `welcome-` session key, never persisted.
 */

import { useEffect, useState } from "react";
import {
  isWelcomeSessionKey,
  welcomeGreetingRevealAt,
} from "../lib/agent-welcome";

export function useWelcomeGreetingRevealed(
  sessionKey: string | null | undefined,
): boolean {
  const revealAt =
    sessionKey && isWelcomeSessionKey(sessionKey)
      ? welcomeGreetingRevealAt(sessionKey)
      : undefined;
  const [now, setNow] = useState(() => Date.now());
  const waiting = revealAt !== undefined && now < revealAt;
  useEffect(() => {
    if (!waiting || revealAt === undefined) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(revealAt - Date.now(), 0) + 10,
    );
    return () => clearTimeout(timer);
  }, [waiting, revealAt]);
  if (!isWelcomeSessionKey(sessionKey)) return false;
  return !waiting;
}

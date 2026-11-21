import type { ChatMessage } from "@houston/runtime-client";
import { liveTurn } from "./turn-stream";
import { conversationVm } from "./vm";

const LIVE_TURN_GRACE_MS = 90_000;

const PROBE_DELAYS_MS = [2_000, 4_000, 8_000, 15_000];
const IMMEDIATE_DELAYS_MS = [0, ...PROBE_DELAYS_MS];

interface WatchdogSession {
  timer?: ReturnType<typeof setTimeout>;
}
const sessions = new Map<string, WatchdogSession>();

const provesIdle = (messages: ChatMessage[]): boolean =>
  messages.length === 0 || messages[messages.length - 1]?.role === "assistant";

export function armQueueWatchdog(
  scope: string,
  agentPath: string,
  sessionKey: string,
  probe: () => Promise<ChatMessage[]>,
  stillHeld: () => boolean,
  flush: () => void,
  immediate = false,
): void {
  if (sessions.has(scope)) return;
  const session: WatchdogSession = {};
  sessions.set(scope, session);
  const delays = immediate ? IMMEDIATE_DELAYS_MS : PROBE_DELAYS_MS;
  let attempt = 0;
  let deferredSince: number | undefined;
  const owns = (): boolean => sessions.get(scope) === session;
  const schedule = (): void => {
    const delay = delays[Math.min(attempt, delays.length - 1)] ?? 0;
    attempt++;
    session.timer = setTimeout(() => {
      void tick();
    }, delay);
  };
  const tick = async (): Promise<void> => {
    if (!owns()) return;
    if (!stillHeld()) {
      sessions.delete(scope);
      return;
    }
    let idle: boolean;
    try {
      idle = provesIdle(await probe());
    } catch {
      if (owns()) schedule();
      return;
    }
    if (!owns()) return;
    if (!stillHeld()) {
      sessions.delete(scope);
      return;
    }
    const live = idle ? liveTurn(agentPath, sessionKey) : "none";
    if (live === "held") idle = false;
    else if (live === "streaming") {
      deferredSince ??= Date.now();
      if (Date.now() - deferredSince < LIVE_TURN_GRACE_MS) idle = false;
    } else deferredSince = undefined;
    if (!idle) {
      schedule();
      return;
    }
    conversationVm.confirmIdle(agentPath, sessionKey);
    flush();
    if (owns() && stillHeld()) schedule();
  };
  schedule();
}

export function disarmQueueWatchdog(scope: string): void {
  const session = sessions.get(scope);
  if (!session) return;
  if (session.timer !== undefined) clearTimeout(session.timer);
  sessions.delete(scope);
}

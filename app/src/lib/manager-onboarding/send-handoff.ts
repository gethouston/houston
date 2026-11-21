import type { ManagerHandoff } from "../../stores/manager-handoff.ts";

export async function sendManagerHandoff(
  take: () => ManagerHandoff | null,
  restore: (handoff: ManagerHandoff) => void,
  sessionKey: string,
  send: (sessionKey: string, handoff: ManagerHandoff) => Promise<void>,
  track: () => void,
  busy: boolean,
): Promise<void> {
  if (busy) return;
  const handoff = take();
  if (handoff === null) return;
  try {
    await send(sessionKey, handoff);
  } catch (error) {
    restore(handoff);
    throw error;
  }
  track();
}

import { PROVISIONING_PROBE_FILE } from "./agent-provisioning";
import { getEngine, isCoLocatedEngine } from "./engine";

/**
 * Wake-on-intent: hovering (or selecting) a cloud agent fires one cheap
 * fire-and-forget read through the gateway, which scales the agent's sleeping
 * pod back up (any /agents/:id request wakes it). By the time the user has
 * clicked and typed a message, the ~13s wake has largely already happened.
 *
 * The read is the same side-effect-free probe file the provisioning system
 * polls, and the result is thrown away — a failure means nothing here (the
 * chat panel's own asleep-detection remains the source of truth). Deduped per
 * agent so hovering a list never floods the gateway: one attempt per agent
 * per TTL window at most.
 */
const attempted = new Map<string, number>();
const PREWAKE_TTL_MS = 60_000;

export function prewakeAgent(agent: { id: string; folderPath: string }): void {
  if (isCoLocatedEngine()) return; // local engines don't sleep
  const now = Date.now();
  const last = attempted.get(agent.id);
  if (last !== undefined && now - last < PREWAKE_TTL_MS) return;
  attempted.set(agent.id, now);
  void getEngine()
    .readAgentFile(agent.folderPath, PROVISIONING_PROBE_FILE)
    .catch(() => {}); // intent signal only — the wake either lands or the panel's probe retries
}

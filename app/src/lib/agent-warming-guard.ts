/**
 * Write guard for agents whose engine is still warming up (HOU-693).
 *
 * The tabs stay fully explorable during the warm-up, but a write (save a
 * routine, update instructions, install a skill…) would be a held request
 * that dies with infrastructure timeouts or a reload. Instead of letting the
 * button hang for minutes, the guard opens the "your agent is almost ready"
 * dialog and rejects with {@link AgentWarmingError} — which the tauri
 * wrapper's error surface recognizes and does NOT toast or report: the
 * dialog IS the surface.
 */

import { useAgentProvisioningStore } from "../stores/agent-provisioning";
import { useUIStore } from "../stores/ui";
import { warmingReadsAnswerEmpty } from "./agent-provisioning";
import i18n from "./i18n";

export interface WarmingWriteOptions {
  /** The app's own post-create setup write: let it ride as a held request
   *  (HOU-649) instead of blocking with the dialog. Never set from a
   *  user-initiated action. */
  allowWhileWarming?: boolean;
}

export class AgentWarmingError extends Error {
  constructor() {
    super(i18n.t("shell:agentProvisioning.blockedBody"));
    this.name = "AgentWarmingError";
  }
}

export function isAgentWarmingError(e: unknown): boolean {
  return e instanceof AgentWarmingError;
}

/** True when this engine route key belongs to a still-warming agent. */
export function isAgentPathWarming(agentPath: string): boolean {
  const entries = useAgentProvisioningStore.getState().provisioning;
  for (const entry of Object.values(entries)) {
    if (entry.agentPath === agentPath) return true;
  }
  return false;
}

/**
 * True when this route key belongs to a JUST-CREATED warming agent — the only
 * case where per-agent READS may answer "nothing yet" instantly (a fresh agent
 * has no data by definition, HOU-693). An EXISTING agent detected asleep
 * (HOU-730) must NOT short-circuit reads: it HAS data, and the locally
 * persisted list/transcript caches are already painting it — an instant empty
 * success would wipe the painted cards and overwrite the on-disk cache with
 * `[]`. Its reads ride the gateway hold instead and settle on pod wake.
 */
export function isAgentPathCreating(agentPath: string): boolean {
  const entries = useAgentProvisioningStore.getState().provisioning;
  for (const entry of Object.values(entries)) {
    if (entry.agentPath === agentPath) return warmingReadsAnswerEmpty(entry);
  }
  return false;
}

/**
 * Gate a per-agent WRITE: no-op when the agent's engine is up; otherwise
 * open the notice dialog and throw. Call at the top of a tauri wrapper.
 */
export function blockWriteWhileWarming(agentPath: string): void {
  if (!isAgentPathWarming(agentPath)) return;
  useUIStore.getState().setAgentWarmingNoticeOpen(true);
  throw new AgentWarmingError();
}

/** Same gate for wrappers keyed by agent id instead of engine route key. */
export function blockWriteWhileWarmingById(agentId: string): void {
  if (!useAgentProvisioningStore.getState().provisioning[agentId]) return;
  useUIStore.getState().setAgentWarmingNoticeOpen(true);
  throw new AgentWarmingError();
}

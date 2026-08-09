/**
 * Reactive slice of the optimistic warm-up rows (HOU-713) for the CROSS-AGENT
 * board: every mission queued while some agent's engine cold-starts, shaped as
 * a `running` conversation the sweep never returned.
 *
 * Agents have no board of their own any more, so this is the only place those
 * missions can appear — and the "just created an agent" flow lands straight on
 * a team board, which is exactly when an engine is coldest. Empty (and stable)
 * when nothing is warming, so consumers merge unconditionally. The store bumps
 * `sendsVersion` on every queue — that is the re-render signal, since entries
 * mutate in place.
 */

import {
  type WarmingAgentRef,
  type WarmingConversation,
  warmingConversations,
} from "../lib/warming-board-rows";
import { useAgentProvisioningStore } from "../stores/agent-provisioning";

const NONE: WarmingConversation[] = [];

export function useWarmingConversations(
  agents: readonly WarmingAgentRef[],
): WarmingConversation[] {
  const provisioning = useAgentProvisioningStore((s) => s.provisioning);
  // Subscribed for the SIGNAL, not the value: a queued send mutates its entry
  // in place, so neither the entry nor its array changes identity and nothing
  // else here would ever re-render. The counter is what does.
  useAgentProvisioningStore((s) => s.sendsVersion);
  // Not memoized: with nothing warming this returns the SHARED empty array
  // (the whole normal path, referentially stable), and during the seconds an
  // engine is cold a fresh array per render costs one board re-derive.
  const rows = warmingConversations(agents, provisioning);
  return rows.length > 0 ? rows : NONE;
}

import { useMemo } from "react";
import { sweepSettled } from "../../lib/sweep-settled";
import type { RawConversation } from "../../lib/tauri";
import { useAgentStore } from "../../stores/agents";
import { useAllConversations } from "./use-conversations";

const EMPTY_ROWS: readonly RawConversation[] = [];

export interface SettledConversations {
  /** Every agent's missions, as the last sweep left them. */
  rows: readonly RawConversation[];
  /** Real data for a LOADED roster, with no refetch in flight. */
  settled: boolean;
  /** How many missions exist, or `null` until the sweep has settled. */
  count: number | null;
}

/**
 * The cross-agent mission sweep, read the way a WATCHER needs it: over the
 * whole current roster, and told plainly whether the answer can be trusted yet.
 *
 * Settledness is the load-bearing part. An in-flight sweep reads as zero
 * missions, so anything that takes a baseline from one (the guided setup
 * waiting for a first task, a lesson beat waiting for a new conversation)
 * would count every mission the user already had as brand new. `count` is
 * withheld entirely until the sweep settles rather than reported as zero.
 *
 * No fetch of its own: this is the same cache key the sidebar badges and
 * Mission Control mount, keyed by the roster's folder paths.
 */
export function useSettledConversations(): SettledConversations {
  const agents = useAgentStore((s) => s.agents);
  // An UNLOADED roster is empty too, and is not an answer — the rule that
  // keeps the boot gap from reading as "this user has no agents and no
  // missions" lives in `lib/sweep-settled.ts`.
  const rosterLoaded = useAgentStore((s) => s.loaded);
  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const conversations = useAllConversations(agentPaths);

  const rows = conversations.data ?? EMPTY_ROWS;
  const settled = sweepSettled({
    rosterLoaded,
    agentCount: agentPaths.length,
    hasData: conversations.data !== undefined,
    isFetching: conversations.isFetching,
  });
  return { rows, settled, count: settled ? rows.length : null };
}

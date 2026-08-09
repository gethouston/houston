/**
 * Optimistic board rows while the agent's engine warms up (HOU-713).
 *
 * A mission created against a warming engine parks its board-row write with
 * the queued send (`lib/warming-sends.ts`) — and the board's own list read is
 * held for the whole cold start, so without help the card only appears
 * minutes later, when the flush lands. These helpers derive Activity-shaped
 * rows from the queued sends so the board can render the mission as
 * `running` the moment the user sends it; the real rows replace them when
 * the flush writes them and the activity query refetches.
 *
 * Kept dependency-free (type-only imports) so `node --test` can exercise it.
 */

import type { Activity } from "../data/activity";
import type { PendingWarmingSend } from "./agent-provisioning";

/** Map the queued first-messages (the ones carrying a board row) to
 *  render-ready activities. `since` anchors rows queued before `queuedAt`
 *  existed (a relaunch restored an older mirror).
 *
 *  Module-private: {@link warmingConversations} is the one entry point, since
 *  the cross-agent board is the only surface these rows can reach. */
function warmingBoardRows(
  pendingSends: PendingWarmingSend[] | undefined,
  since: number,
): Activity[] {
  const rows: Activity[] = [];
  for (const send of pendingSends ?? []) {
    if (!send.row) continue;
    rows.push({
      id: send.row.id,
      title: send.row.title,
      description: send.row.description,
      status: send.row.status ?? "running",
      session_key: send.sessionKey,
      agent: send.row.agent,
      provider: send.row.provider,
      model: send.row.model,
      updated_at: new Date(send.queuedAt ?? since).toISOString(),
    });
  }
  return rows;
}

/**
 * Overlay the optimistic rows onto the fetched list. Fetched rows win by id:
 * once the flush's id-upsert lands, the server row (with the real status the
 * turn stream writes) must not be shadowed by the stale optimistic copy.
 * With nothing queued this is the identity — `undefined` stays `undefined`,
 * so the board's "still loading" state is untouched on the normal path.
 *
 * Generic over the row shape because the SAME overlay now serves the
 * cross-agent board, whose rows are conversations rather than activities.
 */
export function mergeWarmingRows<T extends { id: string }>(
  fetched: T[] | undefined,
  warming: T[],
): T[] | undefined {
  if (warming.length === 0) return fetched;
  const seen = new Set((fetched ?? []).map((a) => a.id));
  return [...(fetched ?? []), ...warming.filter((r) => !seen.has(r.id))];
}

/** The identity a cross-agent warming row has to carry to reach a card. */
export interface WarmingAgentRef {
  id: string;
  folderPath: string;
  name: string;
}

/** One agent's provisioning entry, as the store holds it. Module-private: it
 *  only names {@link warmingConversations}'s input, which callers pass
 *  straight from the store. */
interface WarmingEntry {
  since: number;
  pendingSends?: PendingWarmingSend[];
}

/**
 * A conversation-shaped warming row, the shape the CROSS-AGENT sweep returns
 * (`RawConversation`). Structural rather than an import so this module stays
 * dependency-free for `node --test`.
 */
export interface WarmingConversation {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type: "activity";
  session_key: string;
  updated_at?: string;
  agent_path: string;
  agent_name: string;
  agent?: string;
}

/**
 * The same optimistic rows, for the board that spans every agent.
 *
 * Since agents lost their own boards, a mission started against a still-cold
 * agent has ONLY the cross-agent board (the global one, or its team's) to
 * appear on — and that board reads the conversation sweep, whose write is
 * exactly what the cold start is holding. Without this overlay the card would
 * be missing for the whole warm-up, right after creating an agent, which is
 * the flow that lands there most.
 */
export function warmingConversations(
  agents: readonly WarmingAgentRef[],
  provisioning: Record<string, WarmingEntry | undefined>,
): WarmingConversation[] {
  const rows: WarmingConversation[] = [];
  for (const agent of agents) {
    const entry = provisioning[agent.id];
    if (!entry) continue;
    for (const row of warmingBoardRows(entry.pendingSends, entry.since)) {
      rows.push({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        type: "activity",
        session_key: row.session_key ?? `activity-${row.id}`,
        updated_at: row.updated_at,
        agent_path: agent.folderPath,
        agent_name: agent.name,
        ...(row.agent ? { agent: row.agent } : {}),
      });
    }
  }
  return rows;
}

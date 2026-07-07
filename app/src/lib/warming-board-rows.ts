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
 *  existed (a relaunch restored an older mirror). */
export function warmingBoardRows(
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
 */
export function mergeWarmingRows(
  fetched: Activity[] | undefined,
  warming: Activity[],
): Activity[] | undefined {
  if (warming.length === 0) return fetched;
  const seen = new Set((fetched ?? []).map((a) => a.id));
  return [...(fetched ?? []), ...warming.filter((r) => !seen.has(r.id))];
}

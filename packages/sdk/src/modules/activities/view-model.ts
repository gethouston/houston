/**
 * The board's two derivations from a wire `Activity`: its SESSION ADDRESS (the
 * chat a mission card opens) and its projection onto the scope view-model item.
 *
 * Kept beside the declarations in `./types.ts` rather than inside them because
 * these are the behavior every surface shares — the reactive facade, the
 * missions search index and the web adapter all resolve a card by the same
 * session-key rule, and one copy of that rule is why a status write lands on
 * the same card on every surface.
 */

import { addressesMission, missionConversationKey } from "@houston/domain";
import type { Activity } from "@houston/protocol";
import type { ActivityItem } from "./types";

/**
 * The board's session address for an activity: the explicit `session_key`, or
 * the `activity-<id>` convention the board uses for missions with no explicit
 * key (PARITY §6). A routine chat carries its own `session_key`.
 */
export function sessionKeyOf(a: Activity): string {
  return missionConversationKey(a);
}

/**
 * True when `sessionKey` addresses activity `a`: its explicit `session_key` OR
 * the `activity-<id>` board convention. Matches EITHER form (not just
 * {@link sessionKeyOf}'s preferred one), identical to the web adapter's resolver
 * (`engine-adapter/client.ts` `setActivityStatus`), so a turn's board-status
 * write lands on the same card on both surfaces.
 */
export function matchesActivitySessionKey(
  a: Activity,
  sessionKey: string,
): boolean {
  return addressesMission(a, sessionKey);
}

/** Project a wire `Activity` onto the scope view-model item. Lossless for the
 *  fields a surface reads; omits empty optionals so the snapshot stays clean. */
export function toActivityItem(a: Activity): ActivityItem {
  return {
    id: a.id,
    title: a.title,
    status: a.status,
    sessionKey: sessionKeyOf(a),
    ...(a.description ? { description: a.description } : {}),
    ...(a.updated_at !== undefined ? { updatedAt: a.updated_at } : {}),
    ...(a.routine_id !== undefined ? { routineId: a.routine_id } : {}),
    ...(a.origin_session_key !== undefined
      ? { originSessionKey: a.origin_session_key }
      : {}),
    ...(a.agent !== undefined ? { agent: a.agent } : {}),
    ...(a.worktree_path !== undefined ? { worktreePath: a.worktree_path } : {}),
    ...(a.provider !== undefined ? { provider: a.provider } : {}),
    ...(a.model !== undefined ? { model: a.model } : {}),
  };
}

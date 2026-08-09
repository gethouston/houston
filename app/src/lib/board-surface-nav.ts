/**
 * Which of a mission board's two surfaces owns a published mission target.
 *
 * A mission board is really two boards that SWAP: the active one and the
 * archive. Every "open this mission" navigation — a session-finished
 * notification, a @mention row, the command palette's recent missions — names
 * a mission id and nothing else, so before anyone can open it somebody has to
 * decide which of the two surfaces is even capable of showing it.
 *
 * **The decision is made against the RAW sweep rows, never against either
 * board's items.** That is the whole point of this module. The active board
 * filters `status === "archived"` OUT and the archive keeps ONLY those, so
 * asking a board "do you have this mission?" answers "no" for half the
 * missions in the workspace — and a "no" from the board on the glass is
 * indistinguishable from "this mission does not exist". Routed that way, an
 * @mention pointing at an archived mission published its id, the active board
 * was forced on screen, and the panel opened on a null session: a blank dead
 * chat whose composer silently swallowed every send. The raw rows are the one
 * place both statuses coexist, so they are the one honest authority.
 *
 * Pure and dependency-free (one type-only import) so `node --test` exercises
 * every branch directly: the surfaces themselves are React, but the RULE is
 * not, and a rule this load-bearing should not need a rendered board to assert.
 */

import { ARCHIVED_STATUS } from "./mission-selection.ts";

/** Which of a mission board's two surfaces owns a published mission target. */
export type BoardSurface = "active" | "archived";

/** The shape this module needs of a swept conversation row: an id and the
 *  status that decides which surface renders it. */
export interface SurfaceRow {
  id: string;
  status?: string | null;
}

/**
 * The surface that must be on screen for a published target to be openable.
 *
 * `null` = nothing published. An id the sweep does not know is "active": a
 * mission created a beat ago has no row yet, and the active board is where it
 * belongs (see `useJustCreatedMission`, which holds its identity for exactly
 * that beat). The same answer covers a sweep that has not returned at all —
 * guessing "archived" on no evidence would strand a live mission behind a
 * surface the user never asked for.
 */
export function pendingMissionSurface(
  rows: readonly SurfaceRow[] | undefined,
  pendingId: string | null,
): BoardSurface | null {
  if (!pendingId) return null;
  const row = rows?.find((r) => r.id === pendingId);
  return row?.status === ARCHIVED_STATUS ? "archived" : "active";
}

/**
 * The surface a kept-alive mission board shows on (re)becoming visible: the one
 * a published nav names, else ACTIVE — the archive is never where a navigation
 * leaves you (the stickiness rule).
 *
 * A board the user left while looking at the archive is still mounted, archive
 * and all, so without this a genuine `viewMode` / team change comes back to the
 * archive as if the user had asked for it. Only the false→true edge of "am I on
 * the glass" runs this: toggling the archive from the toolbar happens entirely
 * while the board is visible and must be left alone.
 */
export function surfaceOnActivate(pending: BoardSurface | null): BoardSurface {
  return pending ?? "active";
}

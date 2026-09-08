import type { ConversationVM } from "@houston/sdk";

/**
 * The per-session loading rollup a chat surface renders as its spinner, derived
 * from the two lifecycle signals a surface has: the SDK conversation VM (the
 * live turn) and the board's activity rows (the host-persisted settle).
 *
 * Pure so the semantics are pinned by unit tests rather than by clicking a
 * chat: the hook (`use-agent-board-send.ts`) only gathers the inputs.
 */

/** A conversation's VM status, or `undefined` when nothing was ever published
 *  for it (a chat with no folded turn or history read yet). */
export type VmSessionStatus = ConversationVM["sessionStatus"] | undefined;

/**
 * The activity rows behind a chat surface, keyed by session key.
 *
 * `present: false` does NOT mean "the board is empty" — it means the surface
 * has NO board at all (the assistant chat, which deliberately creates no
 * activity record so it stays out of every board, unread count and mention
 * sweep). The distinction is load-bearing: an empty board still expects a row
 * to land for the mission that was just created, so an unknown row keeps the
 * spinner on; a boardless chat never gets one, so the conversation VM is its
 * only settle signal.
 */
export type BoardRows =
  | {
      readonly present: true;
      readonly statusBySession: ReadonlyMap<string, string>;
    }
  | { readonly present: false };

export interface SessionLoadingInput {
  /** Sessions this surface itself sent into (the optimistic local flag). */
  locallySent: Readonly<Record<string, boolean>>;
  rows: BoardRows;
  /** The conversation this surface has open and is SUBSCRIBED to, if any. */
  openSessionKey: string | null;
  vmStatus: (sessionKey: string) => VmSessionStatus;
}

/** The board's key for an activity row: its conversation, or an `activity-<id>`
 *  stand-in for a row that carries none. */
export function rowSessionKey(row: {
  id: string;
  session_key?: string;
}): string {
  return row.session_key ?? `activity-${row.id}`;
}

/**
 * A session is busy whenever its activity row is running — not just when WE
 * started it — so the chat keeps Stop/Esc live for turns kicked off elsewhere
 * (routines, onboarding, Mission Control). A boardless chat has no such row, so
 * there the turn lifecycle in the conversation VM both starts and ends it.
 */
export function deriveSessionLoading({
  locallySent,
  rows,
  openSessionKey,
  vmStatus,
}: SessionLoadingInput): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, sent] of Object.entries(locallySent)) {
    if (!sent) continue;
    const status = vmStatus(key);
    if (!rows.present) {
      // No row will ever settle this chat, so the VM IS the turn lifecycle:
      // any published non-running status ends the spinner — a settle
      // ("completed" / "error") or the server-confirmed idle heal. Only an
      // unpublished conversation (the send's own turn has not folded yet)
      // keeps it on.
      if (status === undefined || status === "running") out[key] = true;
      continue;
    }
    // The row is the host-persisted signal, so "idle" is read as "the VM has
    // nothing to say" and the row decides.
    const known = status === "idle" ? undefined : status;
    const rowStatus = rows.statusBySession.get(key);
    if (!known && rowStatus && rowStatus !== "running") continue;
    if (!known || known === "running") out[key] = true;
  }
  if (rows.present) {
    for (const [key, status] of rows.statusBySession) {
      if (status === "running" || vmStatus(key) === "running") out[key] = true;
    }
  }
  // The open conversation follows its own turn even when this surface never
  // sent it (a turn resumed after a reload, or started on another device).
  if (openSessionKey && vmStatus(openSessionKey) === "running") {
    out[openSessionKey] = true;
  }
  return out;
}

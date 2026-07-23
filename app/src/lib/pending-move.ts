/**
 * Durable record of an in-flight C8 agent move (share-via-team).
 *
 * The gateway's move lock is deliberately left in place when a move fails or
 * its mover crashes: only a re-POST of the same move can adopt and resume it,
 * and while the lock exists the control plane refuses to wake the agent, so
 * every agent request answers 503 "agent is being moved". The share dialog
 * used to hold the move only in React state, so closing it (or quitting the
 * app) abandoned the move with no way back and the agent stayed unusable
 * (HOU-817). Persisting the (agent, team, moveId) triple here lets
 * `useMoveResume` re-POST and finish the move on the next boot.
 *
 * Pure + DOM-free (storage injected) so it unit-tests under bare Node.
 */

export interface PendingAgentMove {
  /** The moved agent's id/slug, as passed to `POST /v1/agents/:slug/move`. */
  agentId: string;
  /** Display name for the resume toasts. */
  agentName: string;
  /** Target team space (16-hex slug), the `to` of the re-POST. */
  teamSlug: string;
  teamName: string;
  /** The last known move ticket; a resume polls it before re-POSTing. */
  moveId: string;
  /** Epoch ms when the move was accepted. */
  startedAt: number;
}

const STORAGE_KEY = "houston.pendingAgentMoves";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function isPendingMove(v: unknown): v is PendingAgentMove {
  const m = v as PendingAgentMove | null;
  return (
    typeof m?.agentId === "string" &&
    typeof m.agentName === "string" &&
    typeof m.teamSlug === "string" &&
    typeof m.teamName === "string" &&
    typeof m.moveId === "string" &&
    typeof m.startedAt === "number"
  );
}

/** Every persisted pending move. Tolerant: unreadable state reads as none. */
export function readPendingMoves(
  storage: StorageLike | null = defaultStorage(),
): PendingAgentMove[] {
  const raw = storage?.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPendingMove) : [];
  } catch {
    return [];
  }
}

function write(moves: PendingAgentMove[], storage: StorageLike | null): void {
  if (!storage) return;
  if (moves.length === 0) storage.removeItem(STORAGE_KEY);
  else storage.setItem(STORAGE_KEY, JSON.stringify(moves));
}

/** Upsert the pending move for its agent (one in-flight move per agent). */
export function recordPendingMove(
  move: PendingAgentMove,
  storage: StorageLike | null = defaultStorage(),
): void {
  const rest = readPendingMoves(storage).filter(
    (m) => m.agentId !== move.agentId,
  );
  write([...rest, move], storage);
}

/** Re-key an adopted move to its new ticket so the next poll targets it. */
export function updatePendingMoveId(
  agentId: string,
  moveId: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  write(
    readPendingMoves(storage).map((m) =>
      m.agentId === agentId ? { ...m, moveId } : m,
    ),
    storage,
  );
}

/** Drop the record — call ONLY when the move reached terminal `done`. */
export function clearPendingMove(
  agentId: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  write(
    readPendingMoves(storage).filter((m) => m.agentId !== agentId),
    storage,
  );
}

// In-memory claims: whichever surface is actively driving a move (the share
// dialog's poll, or the boot resume) claims the agent so the other leaves it
// alone. Deliberately NOT persisted — a crash must release every claim.
const activeClaims = new Set<string>();

/** Mark a move as actively driven. Returns false if already claimed. */
export function claimMove(agentId: string): boolean {
  if (activeClaims.has(agentId)) return false;
  activeClaims.add(agentId);
  return true;
}

export function releaseMove(agentId: string): void {
  activeClaims.delete(agentId);
}

export function isMoveClaimed(agentId: string): boolean {
  return activeClaims.has(agentId);
}

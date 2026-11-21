export interface PendingAgentMove {
  agentId: string;
  agentName: string;
  teamSlug: string;
  teamName: string;
  moveId: string;
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

export function recordPendingMove(
  move: PendingAgentMove,
  storage: StorageLike | null = defaultStorage(),
): void {
  const rest = readPendingMoves(storage).filter(
    (m) => m.agentId !== move.agentId,
  );
  write([...rest, move], storage);
}

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

export function clearPendingMove(
  agentId: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  write(
    readPendingMoves(storage).filter((m) => m.agentId !== agentId),
    storage,
  );
}

const activeClaims = new Set<string>();

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

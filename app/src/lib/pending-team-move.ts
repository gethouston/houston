export interface PendingTeamMove {
  sourceTeam: {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    context?: string;
    isDefault: boolean;
  };
  targetSlug: string;
  targetName: string;
  agentIds: string[];
  createdTeamId?: string;
  startedAt: number;
}

const STORAGE_KEY = "houston.pendingTeamMoves";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const defaultStorage = (): StorageLike | null =>
  typeof localStorage === "undefined" ? null : localStorage;

function valid(v: unknown): v is PendingTeamMove {
  const m = v as PendingTeamMove | null;
  return (
    typeof m?.sourceTeam?.id === "string" &&
    typeof m.sourceTeam.name === "string" &&
    typeof m.sourceTeam.isDefault === "boolean" &&
    typeof m.targetSlug === "string" &&
    typeof m.targetName === "string" &&
    Array.isArray(m.agentIds) &&
    m.agentIds.every((id) => typeof id === "string") &&
    typeof m.startedAt === "number"
  );
}

export function readPendingTeamMoves(
  storage: StorageLike | null = defaultStorage(),
): PendingTeamMove[] {
  const raw = storage?.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch {
    return [];
  }
}

export function recordPendingTeamMove(
  move: PendingTeamMove,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  const rest = readPendingTeamMoves(storage).filter(
    (item) => item.sourceTeam.id !== move.sourceTeam.id,
  );
  storage.setItem(STORAGE_KEY, JSON.stringify([...rest, move]));
}

export function clearPendingTeamMove(
  sourceTeamId: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  const moves = readPendingTeamMoves(storage).filter(
    (item) => item.sourceTeam.id !== sourceTeamId,
  );
  if (moves.length === 0) storage.removeItem(STORAGE_KEY);
  else storage.setItem(STORAGE_KEY, JSON.stringify(moves));
}

export function updatePendingTeamMove(
  sourceTeamId: string,
  patch: Partial<Pick<PendingTeamMove, "createdTeamId">>,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  const moves = readPendingTeamMoves(storage).map((item) =>
    item.sourceTeam.id === sourceTeamId ? { ...item, ...patch } : item,
  );
  storage.setItem(STORAGE_KEY, JSON.stringify(moves));
}

const claims = new Set<string>();
export function claimTeamMove(id: string): boolean {
  if (claims.has(id)) return false;
  claims.add(id);
  return true;
}
export function releaseTeamMove(id: string): void {
  claims.delete(id);
}

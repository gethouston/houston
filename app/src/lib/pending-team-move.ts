import type { TeamMoveStage } from "./move-team";

export interface PendingTeamMove {
  sourceTeam: {
    id: string;
    workspaceId: string;
    name: string;
    icon?: string;
    color?: string;
  };
  targetSlug: string;
  targetName: string;
  targetGroupId: string;
  agentIds: string[];
  movedAgentIds: string[];
  postscriptStage?: TeamMoveStage;
  startedAt: number;
}

const STORAGE_KEY = "houston.pendingTeamMoves";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const defaultStorage = (): StorageLike | null =>
  typeof localStorage === "undefined" ? null : localStorage;

function valid(value: unknown): value is PendingTeamMove {
  if (!value || typeof value !== "object") return false;
  const move = value as Partial<PendingTeamMove>;
  return (
    typeof move.sourceTeam?.id === "string" &&
    typeof move.sourceTeam.workspaceId === "string" &&
    typeof move.sourceTeam.name === "string" &&
    typeof move.targetSlug === "string" &&
    typeof move.targetName === "string" &&
    typeof move.targetGroupId === "string" &&
    Array.isArray(move.agentIds) &&
    move.agentIds.every((id) => typeof id === "string") &&
    Array.isArray(move.movedAgentIds) &&
    move.movedAgentIds.every((id) => typeof id === "string") &&
    move.movedAgentIds.every((id) => move.agentIds?.includes(id)) &&
    typeof move.startedAt === "number" &&
    (move.postscriptStage === undefined ||
      ["createTarget", "cleanupSource", "switching"].includes(
        move.postscriptStage,
      ))
  );
}

export function readPendingTeamMoves(
  storage: StorageLike | null = defaultStorage(),
  report: (error: unknown) => void = (error) =>
    console.error("[read_pending_team_moves]", error),
): PendingTeamMove[] {
  const raw = storage?.getItem(STORAGE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    storage?.removeItem(STORAGE_KEY);
    report(error);
    return [];
  }
  const moves = Array.isArray(parsed) ? parsed.filter(valid) : [];
  if (!Array.isArray(parsed) || moves.length !== parsed.length) {
    if (moves.length === 0) storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, JSON.stringify(moves));
    report(new Error("discarded incompatible pending team move records"));
  }
  return moves;
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
  patch: Partial<Pick<PendingTeamMove, "movedAgentIds" | "postscriptStage">>,
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

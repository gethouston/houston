import { claimTeamMove, releaseTeamMove } from "./pending-team-move.ts";

export interface TeamMoveClaimOwner {
  current: boolean;
}

export function releaseOwnedTeamMove(
  sourceId: string,
  owner: TeamMoveClaimOwner,
): void {
  if (!owner.current) return;
  releaseTeamMove(sourceId);
  owner.current = false;
}

export function beginPostscriptRetry(
  sourceId: string,
  owner: TeamMoveClaimOwner,
  showBusy: () => void,
): boolean {
  if (!owner.current) {
    if (!claimTeamMove(sourceId)) return false;
    owner.current = true;
  }
  showBusy();
  return true;
}

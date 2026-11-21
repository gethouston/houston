export interface SweepReadiness {
  rosterLoaded: boolean;
  agentCount: number;
  hasData: boolean;
  isFetching: boolean;
}

export function sweepSettled(readiness: SweepReadiness): boolean {
  if (!readiness.rosterLoaded) return false;
  if (readiness.agentCount === 0) return true;
  return readiness.hasData && !readiness.isFetching;
}

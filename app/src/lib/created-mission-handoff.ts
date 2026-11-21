export interface CreatedMission {
  activityId: string;
  agentPath: string;
  sessionKey: string;
}

export const CREATED_MISSION_HANDOFF_TTL_MS = 30_000;

interface CreatedMissionHandoffDeps {
  now(): number;
}

export class CreatedMissionHandoff {
  private pending: { mission: CreatedMission; publishedAt: number } | null =
    null;
  private listeners = new Set<() => void>();
  private deps: CreatedMissionHandoffDeps;

  constructor(deps: CreatedMissionHandoffDeps) {
    this.deps = deps;
  }

  publish(mission: CreatedMission): void {
    this.pending = { mission, publishedAt: this.deps.now() };
    for (const listener of this.listeners) listener();
  }

  read(): CreatedMission | null {
    const pending = this.pending;
    if (!pending) return null;
    if (
      this.deps.now() - pending.publishedAt >=
      CREATED_MISSION_HANDOFF_TTL_MS
    ) {
      this.pending = null;
      return null;
    }
    return pending.mission;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

const handoff = new CreatedMissionHandoff({ now: () => Date.now() });

export function publishCreatedMission(mission: CreatedMission): void {
  handoff.publish(mission);
}

export function readCreatedMission(): CreatedMission | null {
  return handoff.read();
}

export function subscribeCreatedMission(listener: () => void): () => void {
  return handoff.subscribe(listener);
}

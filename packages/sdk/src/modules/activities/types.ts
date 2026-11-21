import type {
  Activity,
  ActivityStamp,
  ActivityUpdate,
  NewActivity,
  PendingInteraction,
  TurnMode,
} from "@houston/protocol";
import type { MissionStartedBy } from "./started-by";

export const ACTIVITY_STATUSES = [
  "running",
  "needs_you",
  "done",
  "error",
  "archived",
] as const;

export interface ActivityItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  updatedAt?: string;
  lastMessageAt?: string;
  sessionKey: string;
  routineId?: string;
  originSessionKey?: string;
  startedBy: MissionStartedBy;
  agent?: string;
  worktreePath?: string | null;
  provider?: string;
  model?: string;
  mode?: TurnMode;
}

export interface ActivitiesViewModel {
  loaded: boolean;
  items: ActivityItem[];
}

export interface CreatedActivity {
  id: string;
  sessionKey: string;
}

export interface ActivitiesWrites {
  create(
    agentId: string,
    input: NewActivity,
    opts?: CreateActivityOptions,
  ): Promise<Activity>;
  update(
    agentId: string,
    id: string,
    updates: ActivityUpdate,
    stamp?: ActivityStamp,
  ): Promise<Activity>;
  setStatus(agentId: string, id: string, status: string): Promise<Activity>;
  rename(agentId: string, id: string, title: string): Promise<Activity>;
  delete(agentId: string, id: string): Promise<void>;
}

export interface CreateActivityOptions {
  retryWhileWaking?: boolean;
}

export interface ActivitiesModule {
  scope(agentId: string): string;
  refresh(agentId: string): Promise<void>;
  list(agentId: string): Promise<Activity[]>;
  create(
    agentId: string,
    title: string,
    description?: string,
  ): Promise<CreatedActivity>;
  setStatus(agentId: string, id: string, status: string): Promise<void>;
  setStatusBySessionKey(
    agentId: string,
    sessionKey: string,
    status: string,
    pendingInteraction: PendingInteraction | null,
    stamp?: ActivityStamp,
  ): Promise<void>;
  rename(agentId: string, id: string, title: string): Promise<void>;
  delete(agentId: string, id: string): Promise<void>;
  writes: ActivitiesWrites;
  dispose(): void;
}

export const activitiesScope = (agentId: string): string =>
  `activities/${agentId}`;

export const ActivitiesCommand = {
  Refresh: "activities/refresh",
  Create: "activities/create",
  SetStatus: "activities/setStatus",
  Rename: "activities/rename",
  Delete: "activities/delete",
} as const;
export type ActivitiesCommandType =
  (typeof ActivitiesCommand)[keyof typeof ActivitiesCommand];

export const ACTIVITY_CHANGED_EVENT = "ActivityChanged";

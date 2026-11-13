import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  ActivityContributor,
  HoustonEvent,
  MissionStarter,
} from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import type { WorkspacePaths } from "../paths";
import type { Answer } from "../routes/registry/types";
import type { Vfs } from "../vfs";

export interface AgentOpChainDeps {
  vfs: Vfs;
  paths: WorkspacePaths;
  ctx: { workspace: Workspace; agent: Agent };
  query: URLSearchParams;
  emit: (event: HoustonEvent) => void;
  actingSub?: string;
  actingAuthor?: ActivityContributor;
  startedBy?: MissionStarter;
  triggersEnabled: boolean;
  /** The acting person's plan floor for a routine write (op `limits`). */
  routineFloorMinutes?: number;
  /** Wired for custom-integration ops only (a per-op manager over the
   *  hydrated definitions file + the gateway's secret store). */
  customIntegrations?: CustomIntegrationManager;
  /** The worker's on-disk agent dir; anchors a migration import's pi
   *  sessions (routes/migration-import.ts). */
  agentDir?: string;
}

/**
 * One route family's handler, adapted to the single shape an op arrives in.
 * The answer is the chain's, unchanged: anything but `false` means answered.
 */
export type OpHandler = (
  deps: AgentOpChainDeps,
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
) => Answer;

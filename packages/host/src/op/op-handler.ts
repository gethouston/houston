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
  routineFloorMinutes?: number;
  customIntegrations?: CustomIntegrationManager;
  agentDir?: string;
}

export type OpHandler = (
  deps: AgentOpChainDeps,
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
) => Answer;

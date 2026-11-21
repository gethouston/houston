import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActivityContributor, HoustonEvent } from "@houston/protocol";
import type { Agent, UserId, Workspace } from "../../domain/types";
import type { ControlPlaneDeps } from "../../server";
import type { AgentRouteDeps } from "../agent-authz";

interface Located {
  method: string;
  path: string;
  url: URL;
  req: IncomingMessage;
  res: ServerResponse;
}

export interface PublicEntry extends Located {
  deps: ControlPlaneDeps;
}

export interface UserEntry extends PublicEntry {
  userId: UserId;
}

export interface AgentEntry extends Located {
  deps: AgentRouteDeps;
  userId: UserId;
}

interface Matched {
  params: Record<string, string>;
  rest: string;
}

export interface PublicCtx extends PublicEntry, Matched {}
export interface UserCtx extends UserEntry, Matched {}
export interface AgentCtx extends AgentEntry, Matched {
  authz: { agent: Agent; workspace: Workspace };
  agentId: string;
  emit?: (event: HoustonEvent) => void;
  actingAs?: string;
  actingAuthor: ActivityContributor | null;
}

export interface DispatchCtx extends Located, Matched {
  deps: AgentRouteDeps;
  userId?: UserId;
  authz?: { agent: Agent; workspace: Workspace };
  agentId?: string;
  emit?: (event: HoustonEvent) => void;
  actingAs?: string;
  actingAuthor?: ActivityContributor | null;
}

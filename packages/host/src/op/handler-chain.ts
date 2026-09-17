import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActivityContributor, HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import type { WorkspacePaths } from "../paths";
import { handleAgentData } from "../routes/agent-data";
import { handleAgentFile } from "../routes/agent-file";
import { handleCustomIntegrationsDispatch } from "../routes/custom-integrations-user";
import { handleMigration } from "../routes/migration";
import { handlePortableExport } from "../routes/portable-export";
import { handlePortablePreview } from "../routes/portable-preview";
import type { Answer } from "../routes/registry/types";
import { handleSkills } from "../routes/skills";
import { handleSkillsManifest } from "../routes/skills-manifest";
import { handleSkillsRemote } from "../routes/skills-remote";
import { handleAttachments } from "../turn/attachments";
import { handleFiles } from "../turn/files";
import type { Vfs } from "../vfs";
import { OP_CHAIN, type OpGroup } from "./op-surface";

export interface AgentOpChainDeps {
  vfs: Vfs;
  paths: WorkspacePaths;
  ctx: { workspace: Workspace; agent: Agent };
  query: URLSearchParams;
  emit: (event: HoustonEvent) => void;
  actingSub?: string;
  actingAuthor?: ActivityContributor;
  triggersEnabled: boolean;
  fetchImpl?: typeof fetch;
  /** Wired for custom-integration ops only (a per-op manager over the
   *  hydrated definitions file + the gateway's secret store). */
  customIntegrations?: CustomIntegrationManager;
}

/**
 * One route family's handler, adapted to the single shape an op arrives in.
 * The answer is the chain's, unchanged: anything but `false` means answered.
 */
type OpHandler = (
  deps: AgentOpChainDeps,
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
) => Answer;

const OP_HANDLERS: Record<OpGroup, OpHandler> = {
  "agent-integrations": (deps, method, rest, req, res) =>
    handleCustomIntegrationsDispatch(
      deps.customIntegrations,
      method,
      rest,
      req,
      res,
    ),
  "agent-data": (deps, method, rest, req, res) =>
    handleAgentData(
      deps.vfs,
      deps.paths,
      deps.ctx,
      method,
      rest,
      req,
      res,
      deps.emit,
      deps.actingSub,
      deps.actingAuthor,
      deps.triggersEnabled,
    ),
  "agent-file": (deps, method, rest, req, res) =>
    handleAgentFile(
      deps.vfs,
      deps.paths,
      deps.ctx,
      method,
      rest,
      req,
      res,
      deps.emit,
    ),
  "skills-manifest": (deps, method, rest, req, res) =>
    handleSkillsManifest(
      deps.vfs,
      deps.paths,
      deps.ctx,
      method,
      rest,
      req,
      res,
      deps.emit,
    ),
  skills: (deps, method, rest, req, res) =>
    handleSkills(
      deps.vfs,
      deps.paths,
      deps.ctx,
      method,
      rest,
      req,
      res,
      deps.emit,
    ),
  "skills-remote": (deps, method, rest, req, res) =>
    handleSkillsRemote(
      deps.vfs,
      deps.paths,
      deps.ctx,
      method,
      rest,
      req,
      res,
      deps.emit,
      deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {},
    ),
  // Files (list/read/download/archive/import/move/rename/folder): the Files
  // tab, byte-identical to the pod.
  "workspace-files": (deps, method, rest, req, res) =>
    handleFiles(
      deps.vfs,
      deps.paths,
      deps.ctx,
      method,
      rest,
      req,
      res,
      deps.query,
      deps.emit,
    ),
  // Composer drops land in uploads/ BEFORE the send (which is a pool turn).
  attachments: (deps, method, rest, req, res) =>
    handleAttachments(
      deps.vfs,
      deps.paths,
      deps.ctx,
      method,
      rest,
      req,
      res,
      deps.emit,
    ),
  "portable-preview": (deps, method, rest, req, res) =>
    handlePortablePreview(deps, deps.ctx, method, rest, req, res),
  "portable-export": (deps, method, rest, req, res) =>
    handlePortableExport(deps, deps.ctx, method, rest, req, res),
  // No agentDir: archives carrying runtime transcripts were declined before
  // dispatch (turn/op-route.ts), so there is never a session to synthesize here.
  migration: (deps, method, rest, req, res) =>
    handleMigration(deps, deps.ctx, method, rest, req, res, deps.emit),
};

/**
 * The pod's own handler chain, run for one op: the SAME handlers the per-agent
 * groups serve, over a hydrated copy of the agent's workspace instead of the
 * pod's disk. Unknown routes answer 404, never a throw.
 */
export async function runAgentOpChain(
  deps: AgentOpChainDeps,
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  for (const group of OP_CHAIN)
    if (await OP_HANDLERS[group](deps, method, rest, req, res)) return;
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not an op route" }));
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAgentData } from "../routes/agent-data";
import { handleAgentFile } from "../routes/agent-file";
import { handleCustomIntegrationsDispatch } from "../routes/custom-integrations-user";
import { handleMigration } from "../routes/migration";
import { handlePortableExport } from "../routes/portable-export";
import { handlePortablePreview } from "../routes/portable-preview";
import { handleSkills } from "../routes/skills";
import { handleSkillsManifest } from "../routes/skills-manifest";
import { handleAttachments } from "../turn/attachments";
import { handleFiles } from "../turn/files";
import { stagedUploads } from "../uploads/commit";
import type { AgentOpChainDeps, OpHandler } from "./op-handler";

import { OP_CHAIN, type OpGroup } from "./op-surface";
import { handleRoutineRunCancelOp } from "./routine-run-cancel";

export type { AgentOpChainDeps } from "./op-handler";

const OP_HANDLERS: Record<OpGroup, OpHandler> = {
  "routine-runs": handleRoutineRunCancelOp,
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
      {
        createdBy: deps.actingSub,
        author: deps.actingAuthor,
        triggersEnabled: deps.triggersEnabled,
        ...(deps.startedBy ? { startedBy: deps.startedBy } : {}),
        ...(deps.routineFloorMinutes
          ? { routineFloorMinutes: deps.routineFloorMinutes }
          : {}),
      },
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
      undefined,
      stagedUploads(undefined, deps.vfs, {
        agentId: deps.ctx.agent.id,
        workspace: deps.ctx.workspace.id,
        owner: deps.actingSub ?? "",
        purpose: "files_import",
      }),
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
      stagedUploads(undefined, deps.vfs, {
        agentId: deps.ctx.agent.id,
        workspace: deps.ctx.workspace.id,
        owner: deps.actingSub ?? "",
        purpose: "attachment",
      }),
    ),
  "portable-preview": (deps, method, rest, req, res) =>
    handlePortablePreview(deps, deps.ctx, method, rest, req, res),
  "portable-export": (deps, method, rest, req, res) =>
    handlePortableExport(deps, deps.ctx, method, rest, req, res),
  // agentDir: a transcript chunk synthesizes its pi sessions on the worker's
  // own tree (turn/op-route.ts), unless the import asked `sessions=0`.
  // routineCreatedBy: the op's verified actor stamps imported routines.
  migration: (deps, method, rest, req, res) =>
    handleMigration(
      {
        ...deps,
        routineCreatedBy: deps.actingSub,
        uploads: stagedUploads(undefined, deps.vfs, {
          agentId: deps.ctx.agent.id,
          workspace: deps.ctx.workspace.id,
          owner: deps.actingSub ?? "",
          purpose: "migration_import",
        }),
      },
      deps.ctx,
      method,
      rest,
      req,
      res,
      deps.emit,
    ),
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

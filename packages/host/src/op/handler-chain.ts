import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActivityContributor, HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import type { WorkspacePaths } from "../paths";
import { handleAgentData } from "../routes/agent-data";
import { handleAgentFile } from "../routes/agent-file";
import { handleCustomIntegrationsDispatch } from "../routes/custom-integrations-user";
import { handleMigration } from "../routes/migration";
import { handlePortableExport } from "../routes/portable";
import { handlePortablePreview } from "../routes/portable-preview";
import { handlePortableStore } from "../routes/portable-store";
import { handleSkills } from "../routes/skills";
import { handleSkillsManifest } from "../routes/skills-manifest";
import { handleSkillsRemote } from "../routes/skills-remote";
import { handleAttachments } from "../turn/attachments";
import { handleFiles } from "../turn/files";
import type { Vfs } from "../vfs";

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
 * The pod's own handler chain, run for one op. Same handlers, same order of
 * disjoint route families as routes/agents.ts — only the filesystem (and the
 * custom-integration manager's construction) underneath is different.
 * Unknown routes answer 404, never a throw.
 */
export async function runAgentOpChain(
  deps: AgentOpChainDeps,
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const { vfs, paths, ctx, emit } = deps;
  if (
    await handleCustomIntegrationsDispatch(
      deps.customIntegrations,
      method,
      rest,
      req,
      res,
    )
  )
    return;
  // Files (list/read/download/archive/import/move/rename/folder): the
  // Files tab, byte-identical to the pod.
  if (
    await handleFiles(vfs, paths, ctx, method, rest, req, res, deps.query, emit)
  )
    return;
  if (
    await handleAgentData(
      vfs,
      paths,
      ctx,
      method,
      rest,
      req,
      res,
      emit,
      deps.actingSub,
      deps.actingAuthor,
      deps.triggersEnabled,
    )
  )
    return;
  if (await handleAgentFile(vfs, paths, ctx, method, rest, req, res, emit))
    return;
  // Composer drops land in uploads/ BEFORE the send (which is a pool turn).
  if (await handleAttachments(vfs, paths, ctx, method, rest, req, res, emit))
    return;
  if (await handleSkillsManifest(vfs, paths, ctx, method, rest, req, res, emit))
    return;
  if (await handleSkills(vfs, paths, ctx, method, rest, req, res, emit)) return;
  if (
    await handleSkillsRemote(
      vfs,
      paths,
      ctx,
      method,
      rest,
      req,
      res,
      emit,
      deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {},
    )
  )
    return;
  if (await handlePortablePreview({ vfs, paths }, ctx, method, rest, req, res))
    return;
  // NOT portable/anonymize: the model pass rides its own op kind (the
  // titles pattern), never the route chain.
  if (await handlePortableExport({ vfs, paths }, ctx, method, rest, req, res))
    return;
  // No agentDir: archives carrying runtime transcripts were declined before
  // dispatch (op-route.ts), so there is never a session to synthesize here.
  if (await handleMigration({ vfs, paths }, ctx, method, rest, req, res, emit))
    return;
  if (
    await handlePortableStore(
      { vfs, paths },
      { ...ctx, userId: ctx.workspace.ownerUserId },
      method,
      rest,
      req,
      res,
    )
  )
    return;
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not an op route" }));
}

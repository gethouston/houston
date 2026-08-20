import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import type { ActivityContributor, HoustonEvent } from "@houston/protocol";
import { LocalPaths } from "../paths";
import { handleAgentData } from "../routes/agent-data";
import { handleAgentFile } from "../routes/agent-file";
import { handleSkills } from "../routes/skills";
import { handleSkillsRemote } from "../routes/skills-remote";
import { LocalWorkspaceStore } from "../store/local";
import { FsVfs } from "../vfs";

/**
 * A write the gateway routes to a pool worker instead of waking the agent's
 * pod: the SAME route handlers the pod runs, executed against a hydrated
 * copy of the agent's workspace. Byte-identical semantics by construction —
 * nothing is reimplemented; only the filesystem underneath is different.
 */
export interface AgentOpRequest {
  method: string;
  /** Route rest after `/agents/<id>/`, e.g. `routines/<id>`, `agentfile/CLAUDE.md`. */
  rest: string;
  body?: string;
  contentType?: string;
  /** Verified acting identity (routines' created_by, activity contributors). */
  actingSub?: string;
  actingAuthor?: ActivityContributor | null;
  triggersEnabled: boolean;
}

export interface AgentOpResponse {
  status: number;
  contentType: string;
  body: string;
  /** Domain events the handler emitted — the caller republishes their docs. */
  events: HoustonEvent[];
}

/**
 * Dispatch one op against `workspacesRoot` (the hydrated `workspaces/` dir)
 * for `agentId`. Runs the handler chain over a loopback server so the
 * handlers see ordinary IncomingMessage/ServerResponse objects. Unknown
 * routes answer 404, never a throw: the worker relays the status verbatim.
 */
export async function dispatchAgentOp(opts: {
  workspacesRoot: string;
  agentId: string;
  request: AgentOpRequest;
  fetchImpl?: typeof fetch;
}): Promise<AgentOpResponse> {
  const store = new LocalWorkspaceStore(opts.workspacesRoot);
  const agent = await store.getAgent(opts.agentId);
  if (!agent) {
    return {
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "agent not found" }),
      events: [],
    };
  }
  const workspace = await store.getWorkspace(agent.workspaceId);
  if (!workspace) {
    return {
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "workspace not found" }),
      events: [],
    };
  }
  const vfs = new FsVfs(opts.workspacesRoot);
  const paths = new LocalPaths();
  const ctx = { workspace, agent };
  const events: HoustonEvent[] = [];
  const emit = (event: HoustonEvent) => {
    events.push(event);
  };
  const { method, rest, triggersEnabled, actingSub, actingAuthor } =
    opts.request;

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
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
        actingSub,
        actingAuthor ?? undefined,
        triggersEnabled,
      )
    )
      return;
    if (await handleAgentFile(vfs, paths, ctx, method, rest, req, res, emit))
      return;
    if (await handleSkills(vfs, paths, ctx, method, rest, req, res, emit))
      return;
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
        opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {},
      )
    )
      return;
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not an op route" }));
  };
  const server = createServer((req, res) => {
    handler(req, res).catch((error: unknown) => {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
      }
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/op`, {
      method,
      headers: opts.request.contentType
        ? { "Content-Type": opts.request.contentType }
        : {},
      body: opts.request.body,
    });
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "application/json",
      body: await response.text(),
      events,
    };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

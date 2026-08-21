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
import { handleSkillsManifest } from "../routes/skills-manifest";
import { handleSkillsRemote } from "../routes/skills-remote";
import { LocalWorkspaceStore } from "../store/local";
import { handleAttachments } from "../turn/attachments";
import { handleFiles } from "../turn/files";
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
  /** Raw query string (files routes take `?path=`), no leading `?`. */
  query?: string;
}

export interface AgentOpResponse {
  /** The hydrated tree holds no such agent: the worker must NOT relay this
   *  as the handler's answer (a legacy layout, a stale envelope) — it declines
   *  so the gateway takes the proxy path instead. */
  agentMissing?: true;
  status: number;
  contentType: string;
  /** Text body (JSON/text responses). Empty when `bodyBase64` is set. */
  body: string;
  /** Binary body (a file download, an archive) — base64, relayed raw. */
  bodyBase64?: string;
  /** Response headers a client depends on (Content-Disposition, Cache-Control). */
  headers?: Record<string, string>;
  /** Domain events the handler emitted — the caller republishes their docs. */
  events: HoustonEvent[];
}

// Only the handlers' own JSON is safe to carry as text: a downloaded file is
// relayed byte-exact (a Latin-1 CSV through `response.text()` would be
// re-encoded), so every non-JSON body rides base64.
const TEXT_BODY = /^application\/json/i;
const RELAYED_HEADERS = [
  "content-disposition",
  "cache-control",
  "etag",
] as const;

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
  const workspace = agent ? await store.getWorkspace(agent.workspaceId) : null;
  if (!agent || !workspace) {
    return {
      agentMissing: true,
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "agent not found" }),
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
  const query = new URLSearchParams(opts.request.query ?? "");

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    // Files (list/read/download/archive/import/move/rename/folder): the
    // Files tab, byte-identical to the pod.
    if (await handleFiles(vfs, paths, ctx, method, rest, req, res, query, emit))
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
        actingSub,
        actingAuthor ?? undefined,
        triggersEnabled,
      )
    )
      return;
    if (await handleAgentFile(vfs, paths, ctx, method, rest, req, res, emit))
      return;
    // Composer drops land in uploads/ BEFORE the send (which is a pool turn).
    if (await handleAttachments(vfs, paths, ctx, method, rest, req, res, emit))
      return;
    if (
      await handleSkillsManifest(vfs, paths, ctx, method, rest, req, res, emit)
    )
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
    const contentType =
      response.headers.get("content-type") ?? "application/json";
    const headers: Record<string, string> = {};
    for (const name of RELAYED_HEADERS) {
      const value = response.headers.get(name);
      if (value) headers[name] = value;
    }
    const relayed = Object.keys(headers).length > 0 ? { headers } : {};
    if (TEXT_BODY.test(contentType)) {
      return {
        status: response.status,
        contentType,
        body: await response.text(),
        ...relayed,
        events,
      };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      contentType,
      body: "",
      bodyBase64: bytes.toString("base64"),
      ...relayed,
      events,
    };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

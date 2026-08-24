import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { ActivityContributor, HoustonEvent } from "@houston/protocol";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import { LocalPaths } from "../paths";
import { LocalWorkspaceStore } from "../store/local";
import { FsVfs, LazyReadRefusedError, type Vfs } from "../vfs";
import { relayAgentOpResponse, TOO_LARGE_MESSAGE } from "./dispatch-relay";
import { runAgentOpChain } from "./handler-chain";

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
  /** Binary request body (a migration zip), base64 — JSON can't carry raw
   *  bytes. Mutually exclusive with `body`. */
  bodyBase64?: string;
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
  /** A binary answer over the relay cap: refused before buffering. */
  tooLarge?: true;
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
  /** Wired for custom-integration ops (see op/handler-chain.ts). */
  customIntegrations?: CustomIntegrationManager;
  /** The handlers' file port, rooted at `workspacesRoot`. Default: the real
   *  directory. A lazy store-backed vfs lets an op run over a manifest-only
   *  tree that downloads objects on first read. */
  vfs?: Vfs;
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
  const vfs = opts.vfs ?? new FsVfs(opts.workspacesRoot);
  const events: HoustonEvent[] = [];
  const { method, rest } = opts.request;

  // A refused lazy read answers 503 from INSIDE the handler chain (the
  // handler may be half-way through a multi-key mutation); the flag tells
  // the caller to discard the overlay instead of syncing a partial result.
  let refused = false;
  const relayError = (res: ServerResponse, error: unknown): void => {
    if (error instanceof LazyReadRefusedError) {
      refused = true;
      // Refused before the download: the same answer the relay cap gives.
      if (!res.headersSent) {
        res.writeHead(503, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: TOO_LARGE_MESSAGE }));
      return;
    }
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  };
  const server = createServer((req, res) => {
    runAgentOpChain(
      {
        vfs,
        paths: new LocalPaths(),
        ctx: { workspace, agent },
        query: new URLSearchParams(opts.request.query ?? ""),
        emit: (event) => {
          events.push(event);
        },
        ...(opts.request.actingSub
          ? { actingSub: opts.request.actingSub }
          : {}),
        ...(opts.request.actingAuthor
          ? { actingAuthor: opts.request.actingAuthor }
          : {}),
        triggersEnabled: opts.request.triggersEnabled,
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
        ...(opts.customIntegrations
          ? { customIntegrations: opts.customIntegrations }
          : {}),
      },
      method,
      rest,
      req,
      res,
    ).catch((error: unknown) => relayError(res, error));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    // A GET/HEAD must carry NO body (fetch throws on any, even ""), and the
    // gateway sends an empty string on every route op.
    const bodiless = method === "GET" || method === "HEAD";
    const body = bodiless
      ? undefined
      : opts.request.bodyBase64 !== undefined
        ? Buffer.from(opts.request.bodyBase64, "base64")
        : opts.request.body || undefined;
    // The query rides the loopback URL too: handlers that parse req.url
    // (migration's ?overwrite=1) see exactly what the pod's server sees.
    const query = opts.request.query ? `?${opts.request.query}` : "";
    const response = await fetch(`http://127.0.0.1:${port}/op${query}`, {
      method,
      headers:
        opts.request.contentType && body !== undefined
          ? { "Content-Type": opts.request.contentType }
          : {},
      ...(body !== undefined ? { body } : {}),
    });
    const relayed = await relayAgentOpResponse(response, rest, events);
    return refused ? { ...relayed, tooLarge: true } : relayed;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

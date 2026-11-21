import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  ActivityContributor,
  HoustonEvent,
  MissionStarter,
} from "@houston/protocol";
import { withDisplayName } from "../auth/agent-name-header";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import { LocalPaths } from "../paths";
import { LocalWorkspaceStore } from "../store/local";
import { FsVfs, LazyReadRefusedError, type Vfs } from "../vfs";
import { lazyRefusalBody, relayAgentOpResponse } from "./dispatch-relay";
import { runAgentOpChain } from "./handler-chain";

export interface AgentOpRequest {
  method: string;
  rest: string;
  body?: string;
  bodyBase64?: string;
  contentType?: string;
  actingSub?: string;
  actingAuthor?: ActivityContributor | null;
  startedBy?: MissionStarter;
  triggersEnabled: boolean;
  routineFloorMinutes?: number;
  query?: string;
}

export interface AgentOpResponse {
  agentMissing?: true;
  tooLarge?: true;
  privateRefused?: true;
  status: number;
  contentType: string;
  body: string;
  bodyBase64?: string;
  headers?: Record<string, string>;
  events: HoustonEvent[];
}

export async function dispatchAgentOp(opts: {
  workspacesRoot: string;
  agentId: string;
  request: AgentOpRequest;
  customIntegrations?: CustomIntegrationManager;
  vfs?: Vfs;
  agentName?: string;
  agentDir?: string;
}): Promise<AgentOpResponse> {
  const store = new LocalWorkspaceStore(opts.workspacesRoot);
  const found = await store.getAgent(opts.agentId);
  const agent = found && withDisplayName(found, opts.agentName);
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

  let refused: LazyReadRefusedError["reason"] | undefined;
  const relayError = (res: ServerResponse, error: unknown): void => {
    if (error instanceof LazyReadRefusedError) {
      refused = error.reason;
      if (!res.headersSent) {
        res.writeHead(503, { "Content-Type": "application/json" });
      }
      res.end(lazyRefusalBody(error.reason));
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
        ...(opts.request.startedBy
          ? { startedBy: opts.request.startedBy }
          : {}),
        triggersEnabled: opts.request.triggersEnabled,
        ...(opts.request.routineFloorMinutes
          ? { routineFloorMinutes: opts.request.routineFloorMinutes }
          : {}),
        ...(opts.agentDir ? { agentDir: opts.agentDir } : {}),
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
    const bodiless = method === "GET" || method === "HEAD";
    const body = bodiless
      ? undefined
      : opts.request.bodyBase64 !== undefined
        ? Buffer.from(opts.request.bodyBase64, "base64")
        : opts.request.body || undefined;
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
    if (refused === "private") return { ...relayed, privateRefused: true };
    return refused ? { ...relayed, tooLarge: true } : relayed;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

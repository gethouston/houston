import { substituteApprovals } from "@houston/host/src/assistant/approval-presentation";
import { runAsCoordinator } from "@houston/host/src/assistant/coordinator-scope";
import { liveTurns } from "@houston/host/src/routes/live-turn";
import type { WireFrame } from "@houston/runtime-client";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { engineAgentId } from "./op-scope";
import type { TurnApprovals } from "./turn-approvals";
import { admitCoordinatorTurn } from "./turn-coordinator-open";
import { coordinatorRoutes } from "./turn-coordinator-routes";
import {
  type CoordinatorServer,
  listenCoordinator,
} from "./turn-coordinator-server";
import type { TurnFilesystem } from "./turn-filesystem";
import type { TurnRequest } from "./types";

/**
 * Everything a pooled Houston turn has that a standing assistant pod's host
 * gives its runtime: the live-turn record the host's plan and grant gates
 * read, the approval records (answered by this turn's message before the
 * model runs), the operation and mission routes, and the host's own
 * re-rendering of approval cards on the frames leaving the turn.
 */
export interface TurnCoordinatorSession {
  /** Serves an assistant or mission route; null for any other path. */
  route(path: string, init?: RequestInit): Promise<Response> | null;
  /** The frame as the host would show it: cards from their records. */
  present(frame: WireFrame): WireFrame;
  /** Why the person's message may not start this turn, or null. */
  admission(): Promise<string | null>;
  dispose(): Promise<void>;
}

export interface TurnCoordinatorInput {
  turn: TurnRequest;
  /** The person this Houston belongs to (the gateway bound the token to them). */
  ownerId: string;
  token: string;
  gatewayUrl: string;
  agentSlug: string;
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  fetchImpl?: typeof fetch;
}

const MISSIONS = /^\/sandbox\/missions([/?]|$)/;
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

const unavailable = () =>
  Response.json(
    {
      error:
        "Houston's approvals could not be read, so nothing it does for the user can run this turn",
      code: "approvals_unavailable",
    },
    { status: 503 },
  );

export function startTurnCoordinator(
  input: TurnCoordinatorInput,
): TurnCoordinatorSession {
  const { turn, filesystem } = input;
  const agentId = engineAgentId(filesystem);
  const workspaceId = agentId.split("/")[0] ?? agentId;
  const conversationId = turn.conversationId;
  const scope = {
    userId: input.ownerId,
    agentSlug: input.agentSlug,
    gateway: { url: input.gatewayUrl, token: input.token },
  };
  liveTurns.start(agentId, conversationId, turn.mode ?? "execute", {
    ...(turn.actingToken ? { actingAs: turn.actingToken } : {}),
    actingUser: input.ownerId,
  });
  let opened: TurnApprovals | undefined;
  const admitted = runAsCoordinator(scope, () =>
    admitCoordinatorTurn(input, agentId),
  ).then((admission) => {
    if (admission.kind === "admitted") opened = admission.approvals;
    return admission;
  });
  let server: Promise<CoordinatorServer> | undefined;
  const listen = () => {
    server ??= listenCoordinator(
      coordinatorRoutes(input, scope, { workspaceId, agentId }, async () => {
        if (!opened) throw new Error("approvals unavailable");
        return opened;
      }),
    );
    return server;
  };
  const forward = async (path: string, init?: RequestInit) => {
    // A message the host would have refused starts nothing: no operation and
    // no mission, whatever route the call names.
    if ((await admitted).kind !== "admitted" || !opened) return unavailable();
    liveTurns.setMode(
      agentId,
      conversationId,
      turn.liveMode?.current ?? turn.mode ?? "execute",
    );
    const records = opened;
    const { origin, token } = await listen();
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${token}`);
    const res = await fetch(`${origin}${path}`, {
      method: init?.method ?? "GET",
      headers,
      ...(init?.body !== undefined ? { body: init.body } : {}),
      ...(init?.signal ? { signal: init.signal } : {}),
    });
    if (!path.startsWith("/sandbox/assistant/")) return res;
    const body = await res.arrayBuffer();
    try {
      // A card raised or answered is durable before the tool hears of it. A
      // spent receipt already was, before its operation left (the host's
      // `persistApprovals` seam).
      await records.save();
    } catch (error) {
      const detail =
        error instanceof Error ? `${error.name}: ${error.message}` : "error";
      console.error(`[turn-coordinator] approvals not saved (${detail})`);
      // A card nobody can answer must not be shown; a call that already ran
      // still reports what it did.
      if (path.endsWith("/pending")) return unavailable();
    }
    // 204 and its kin carry no body, and a Response refuses one.
    return new Response(NULL_BODY.has(res.status) ? null : body, {
      status: res.status,
      headers: res.headers,
    });
  };
  return {
    route: (path, init) =>
      path.startsWith("/sandbox/assistant/") || MISSIONS.test(path)
        ? forward(path, init)
        : null,
    present: (frame) =>
      opened && (frame.type === "done" || frame.type === "sync")
        ? // SAFETY: substitution only rewrites question steps inside the
          // frame; every other field and the frame's own shape pass through.
          (substituteApprovals(
            frame,
            opened.approvals,
            agentId,
            conversationId,
          ) as WireFrame)
        : frame,
    admission: async () => {
      const admission = await admitted;
      return admission.kind === "refused" ? admission.code : null;
    },
    async dispose() {
      liveTurns.end(agentId, conversationId);
      await admitted;
      if (server) await (await server).close();
    },
  };
}

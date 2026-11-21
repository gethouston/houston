import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import {
  type CoordinatorScope,
  runAsCoordinator,
} from "@houston/host/src/assistant/coordinator-scope";
import type { CredentialVault } from "@houston/host/src/ports";
import { handleSandboxAssistant } from "@houston/host/src/routes/assistant-sandbox";
import type { AssistantSandboxDeps } from "@houston/host/src/routes/assistant-sandbox-deps";
import {
  handleSandboxMissions,
  type MissionsDeps,
} from "@houston/host/src/routes/missions-sandbox";

export interface CoordinatorRoutes {
  scope: CoordinatorScope;
  claim: { workspaceId: string; agentId: string };
  assistant: () => Promise<Omit<AssistantSandboxDeps, "vault">>;
  missions: Omit<MissionsDeps, "gatewayFronted">;
}

export interface CoordinatorServer {
  origin: string;
  token: string;
  close(): Promise<void>;
}

export async function listenCoordinator(
  routes: CoordinatorRoutes,
): Promise<CoordinatorServer> {
  const token = randomBytes(32).toString("hex");
  const expected = Buffer.from(token);
  const vault: CredentialVault = {
    sandboxToken: () => token,
    validateSandboxToken: (presented) => {
      const got = Buffer.from(presented);
      return got.length === expected.length && timingSafeEqual(got, expected)
        ? routes.claim
        : null;
    },
  };
  const serve = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const method = (req.method ?? "GET").toUpperCase();
    const handled = url.pathname.startsWith("/sandbox/assistant/")
      ? await handleSandboxAssistant(
          { ...(await routes.assistant()), vault, gatewayFronted: true },
          method,
          url.pathname,
          url,
          req,
          res,
        )
      : await handleSandboxMissions(
          { ...routes.missions, vault, gatewayFronted: true },
          method,
          url.pathname,
          url,
          req,
          res,
        );
    if (!handled) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unknown sandbox route" }));
    }
  };
  const server = createServer((req, res) => {
    runAsCoordinator(routes.scope, () => serve(req, res)).catch(
      (error: unknown) => {
        const detail =
          error instanceof Error ? `${error.name}: ${error.message}` : "error";
        console.error(`[turn-coordinator] request failed (${detail})`);
        if (!res.headersSent)
          res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Houston could not do that right now",
            code: "coordinator_unavailable",
          }),
        );
      },
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    token,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

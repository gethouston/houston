import type { Server } from "node:http";
import type { Capabilities, HoustonEvent } from "@houston/protocol";
import { ProxyChannel, type RuntimeProxy } from "../channel/proxy";
import { MemoryCredentialStore } from "../credentials/store";
import type { UserId } from "../domain/types";
import type { EventHub } from "../events/hub";
import { CloudPaths } from "../paths";
import type {
  CredentialVault,
  RuntimeEndpoint,
  RuntimeLauncher,
  TokenVerifier,
} from "../ports";
import type { ControlPlaneDeps } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";

export interface ReplayHost {
  deps: ControlPlaneDeps;
  ids: Record<string, string>;
  forwarded: string[];
}

const CAPABILITIES: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: [],
  sharedSkills: false,
};

const noopHub: EventHub = {
  emit(_userId: UserId, _event: HoustonEvent) {},
  subscribe: () => () => {},
};

const launcher: RuntimeLauncher = {
  async ensureAwake(): Promise<RuntimeEndpoint> {
    return { baseUrl: "http://runtime.local", token: "runtime-token" };
  },
  async sleep() {},
  async destroy() {},
  async status() {
    return "running";
  },
};

const verifier: TokenVerifier = {
  async verify(token) {
    return token.startsWith("tok:") ? { userId: token.slice(4) } : null;
  },
};

export async function replayHost(): Promise<ReplayHost> {
  const store = new MemoryWorkspaceStore();
  const credentials = new MemoryCredentialStore();
  const forwarded: string[] = [];
  const proxy: RuntimeProxy = {
    async forward(_endpoint, request, res) {
      forwarded.push(`${request.method} ${request.path}`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    },
  };
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "Probe",
  });
  await store.getOrCreatePersonalWorkspace("bob");
  const vault: CredentialVault = {
    sandboxToken: () => "sbx",
    validateSandboxToken: (token) =>
      token === "sbx" ? { workspaceId: workspace.id, agentId: agent.id } : null,
  };
  return {
    ids: { agentId: agent.id, workspaceId: workspace.id },
    forwarded,
    deps: {
      verifier,
      store,
      credentials,
      vault,
      channels: {
        gke: new ProxyChannel({
          launcher,
          proxy,
          credentials,
          forwardActingHeader: false,
        }),
      },
      capabilities: CAPABILITIES,
      vfs: new MemoryVfs(),
      paths: new CloudPaths(),
      events: noopHub,
      feedback: { send: async () => "feedback-1" },
      metrics: {
        render: async () => "houston_boot_seconds 1\n",
        contentType: "text/plain; version=0.0.4",
      },
    },
  };
}

export async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("probe server did not bind a port");
  return `http://127.0.0.1:${address.port}`;
}

export async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

export function fenceOutboundFetch(): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.startsWith("http://127.0.0.1:")) return real(input, init);
    return Promise.resolve(
      new Response(JSON.stringify({ stubbed: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return () => {
    globalThis.fetch = real;
  };
}

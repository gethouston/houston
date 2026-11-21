import type { Server } from "node:http";
import { unpackAgent } from "@houston/domain";
import type { Capabilities } from "@houston/protocol";
import { afterEach, expect, test } from "vitest";
import {
  AGENT_NAME_HEADER,
  displayNameFromHeader,
} from "../auth/agent-name-header";
import { MemoryCredentialStore } from "../credentials/store";
import type { TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";

const verifier: TokenVerifier = {
  async verify(b) {
    return b.startsWith("tok:") ? { userId: b.slice(4) } : null;
  },
};
const CAPS: Capabilities = {
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

const servers: Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0))
    await new Promise<void>((r) => s.close(() => r()));
});

async function host(gatewayFronted: boolean) {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    channels: {},
    vfs,
    capabilities: CAPS,
    gatewayFronted,
  };
  const server = createControlPlaneServer(deps);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const created = await fetch(`${base}/agents`, {
    method: "POST",
    headers: { Authorization: "Bearer tok:alice" },
    body: JSON.stringify({ name: "Sales" }),
  });
  const { id } = (await created.json()) as { id: string };
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const [agent] = await store.listAgents(ws.id);
  if (!agent) throw new Error("the create made no agent");
  await vfs.writeText(`${DEFAULT_PATHS.agentRoot(ws, agent)}/report.md`, "#");
  return { base, id };
}

async function exportAs(gatewayFronted: boolean, header?: string) {
  const { base, id } = await host(gatewayFronted);
  const headers: Record<string, string> = {
    Authorization: "Bearer tok:alice",
    "Content-Type": "application/json",
    ...(header !== undefined ? { [AGENT_NAME_HEADER]: header } : {}),
  };
  const exported = await fetch(`${base}/agents/${id}/portable/export`, {
    method: "POST",
    headers,
    body: JSON.stringify({ claudeMd: false }),
  });
  const archive = await fetch(`${base}/agents/${id}/files/archive`, {
    headers,
  });
  return {
    disposition: exported.headers.get("content-disposition"),
    agentName: unpackAgent(new Uint8Array(await exported.arrayBuffer()))
      .manifest.agentName,
    archiveDisposition: archive.headers.get("content-disposition"),
  };
}

test("a gateway-fronted host names the export and the files zip by the gateway's name", async () => {
  const named = await exportAs(true, encodeURIComponent("Closer Ñ"));
  expect(named.agentName).toBe("Closer Ñ");
  expect(named.disposition).toBe(
    'attachment; filename="Closer Ñ.houstonagent"',
  );
  expect(named.archiveDisposition).toContain("Closer%20%C3%91%20files.zip");
});

test("a host the gateway does not front ignores the header", async () => {
  const named = await exportAs(false, "Closer");
  expect(named.agentName).toBe("Sales");
  expect(named.archiveDisposition).toContain("Sales files.zip");
});

test("an invalid or undecodable name header leaves the folder name", async () => {
  for (const header of ["a%2Fb", "%E0%A4%A", "", "%20%20"]) {
    const named = await exportAs(true, header);
    expect(named.agentName, header).toBe("Sales");
  }
  expect(displayNameFromHeader(["Closer", "Other"])).toBe("Closer");
  expect(displayNameFromHeader(undefined)).toBeUndefined();
});

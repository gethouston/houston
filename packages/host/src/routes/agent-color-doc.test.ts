import type { Server } from "node:http";
import { getPreference } from "@houston/domain";
import type { Capabilities } from "@houston/protocol";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import {
  AGENT_COLORS_PREF_KEY,
  clearAgentColor,
  moveAgentColor,
  parseAgentColorMap,
  storeAgentColor,
} from "./agent-color";

const colors = (vfs: MemoryVfs, workspaceId: string) =>
  getPreference(vfs, workspaceId, AGENT_COLORS_PREF_KEY).then(
    parseAgentColorMap,
  );

describe("concurrent writers keep every entry", () => {
  test("two colors set at the same time both survive", async () => {
    const vfs = new MemoryVfs();
    await Promise.all([
      storeAgentColor(vfs, "ws", "agent-a", "forest"),
      storeAgentColor(vfs, "ws", "agent-b", "teal"),
    ]);
    expect(await colors(vfs, "ws")).toEqual({
      "agent-a": "forest",
      "agent-b": "teal",
    });
  });

  test("a rename and a recolor at the same time both land", async () => {
    const vfs = new MemoryVfs();
    await storeAgentColor(vfs, "ws", "old-id", "forest");
    await Promise.all([
      moveAgentColor(vfs, "ws", "old-id", "new-id"),
      storeAgentColor(vfs, "ws", "other", "teal"),
    ]);
    expect(await colors(vfs, "ws")).toEqual({
      "new-id": "forest",
      other: "teal",
    });
  });

  test("a delete does not resurrect a concurrently written entry", async () => {
    const vfs = new MemoryVfs();
    await storeAgentColor(vfs, "ws", "doomed", "forest");
    await Promise.all([
      clearAgentColor(vfs, "ws", "doomed"),
      storeAgentColor(vfs, "ws", "kept", "teal"),
    ]);
    expect(await colors(vfs, "ws")).toEqual({ kept: "teal" });
  });

  test("different accounts never queue behind each other's entries", async () => {
    const vfs = new MemoryVfs();
    await Promise.all([
      storeAgentColor(vfs, "ws-one", "agent-a", "forest"),
      storeAgentColor(vfs, "ws-two", "agent-b", "teal"),
    ]);
    expect(await colors(vfs, "ws-one")).toEqual({ "agent-a": "forest" });
    expect(await colors(vfs, "ws-two")).toEqual({ "agent-b": "teal" });
  });

  test("a failed write does not wedge the ones queued behind it", async () => {
    const vfs = new MemoryVfs();
    const exploding = new Proxy(vfs, {
      get(target, prop, receiver) {
        if (prop === "writeText") {
          return async () => {
            throw new Error("disk full");
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as MemoryVfs;
    await expect(
      storeAgentColor(exploding, "ws", "agent-a", "forest"),
    ).rejects.toThrow("disk full");
    await storeAgentColor(vfs, "ws", "agent-b", "teal");
    expect(await colors(vfs, "ws")).toEqual({ "agent-b": "teal" });
  });
});

describe("a create-time color lands in the document the app reads", () => {
  const verifier: TokenVerifier = {
    async verify(bearer) {
      return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
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

  let server: Server;
  let base = "";
  let vfs: MemoryVfs;

  beforeEach(async () => {
    vfs = new MemoryVfs();
    const store = new MemoryWorkspaceStore();
    await store.getOrCreatePersonalWorkspace("bob");
    const deps: ControlPlaneDeps = {
      store,
      credentials: new MemoryCredentialStore(),
      vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
      channels: {},
      verifier,
      capabilities: CAPS,
      vfs,
    };
    server = createControlPlaneServer(deps);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("createAgent with a color is read back through /v1/preferences", async () => {
    const headers = {
      Authorization: "Bearer tok:alice",
      "Content-Type": "application/json",
    };
    const created = await fetch(`${base}/agents`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Sales", color: "forest" }),
    });
    expect(created.status).toBe(201);
    const agentId = String(
      ((await created.json()) as Record<string, unknown>).id ?? "",
    );
    expect(agentId).not.toBe("");

    const read = await fetch(
      `${base}/v1/preferences/${AGENT_COLORS_PREF_KEY}`,
      { headers },
    );
    const value = ((await read.json()) as { value: string | null }).value;
    expect(parseAgentColorMap(value)[agentId]).toBe("forest");
  });
});

import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { TurnChannel } from "../channel/turn";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspaceCredential } from "../ports";
import { MemoryVfs } from "../vfs";
import { ConnectManager } from "./connect";
import type { TurnDeps } from "./deps";
import { TurnQuota } from "./quota";
import { TurnRelay } from "./relay";
import { dispatchTurn } from "./start-turn";

/**
 * The cloud per-turn dispatch seam for the BYO openai-compatible provider. The
 * bug: the cloudrun runtime never dispatched to a configured endpoint and
 * silently substituted Codex, and — even resolved — no credential was served so
 * the runtime hard-errored "No provider connected". These tests drive the REAL
 * dispatchTurn (not resolveTurnModel alone) and inspect the POST /turn body the
 * fake runtime captures: the served credential IS the proof of both the
 * dispatched provider (credential.provider) and its auth (credential.access).
 */

const ws: Workspace = {
  id: "w1",
  ownerUserId: "alice",
  kind: "personal",
  name: "Personal",
  slug: "alice",
  runtime: "cloudrun",
  createdAt: 1,
};
const agent: Agent = {
  id: "agent-1",
  workspaceId: "w1",
  name: "Sales",
  createdAt: 1,
};
const ctx = { workspace: ws, agent };
const prefix = "ws/w1/agent-1";

// Fake turn runtime: records the request body, streams user→text→done.
let turnBodies: Record<string, unknown>[] = [];
let fakeRuntime: Server;
let runtimeUrl = "";

beforeAll(async () => {
  fakeRuntime = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      turnBodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ type: "done", data: null })}\n\n`);
      res.end();
    });
  });
  await new Promise<void>((r) => fakeRuntime.listen(0, "127.0.0.1", () => r()));
  runtimeUrl = `http://127.0.0.1:${(fakeRuntime.address() as AddressInfo).port}`;
});

afterAll(() => fakeRuntime.close());

function makeDeps(): { deps: TurnDeps; objects: MemoryVfs } {
  const objects = new MemoryVfs();
  const credentials = new MemoryCredentialStore();
  const deps: TurnDeps = {
    runtimeUrl,
    turnToken: "turn-secret",
    relay: new TurnRelay(),
    quota: new TurnQuota({ maxConcurrent: 2, perHour: 100 }),
    vfs: objects,
    credentials,
    connect: new ConnectManager(credentials),
    refresh: async (cred: WorkspaceCredential) => cred,
    idToken: async () => null,
    codexModels: ["gpt-5.5"],
  };
  return { deps, objects };
}

/** Mark the agent's saved active provider (settings.json the runtime reads). */
async function setActiveProvider(objects: MemoryVfs, provider: string) {
  await objects.writeText(
    `${prefix}/data/settings.json`,
    JSON.stringify({ activeProvider: provider }),
  );
}

/** Drive one turn and resolve once its terminal frame lands on the relay. */
async function driveTurn(deps: TurnDeps): Promise<void> {
  const done = new Promise<void>((r) => {
    deps.relay.subscribe("agent-1/c1", (e) => {
      if (e.type === "done" || e.type === "error") r();
    });
  });
  const outcome = await dispatchTurn(deps, ws, agent, "c1", "hi", undefined);
  expect(outcome.status).toBe("accepted");
  await done;
}

test("active openai-compatible + configured endpoint dispatches with that provider AND a served credential (never Codex)", async () => {
  const { deps, objects } = makeDeps();
  const channel = new TurnChannel(deps);
  await channel.saveCustomEndpoint(ctx, {
    baseUrl: "https://box.example.com/v1",
    model: "my-model",
    apiKey: "sk-user-key",
  });
  await setActiveProvider(objects, "openai-compatible");
  turnBodies = [];

  await driveTurn(deps);

  const sent = turnBodies[0];
  if (sent === undefined) throw new Error("expected a POST /turn body");
  const cred = sent.credential as Record<string, unknown> | null;
  // The runtime derives the turn's provider from credential.provider — proving
  // openai-compatible dispatched, NOT the silent Codex substitution.
  expect(cred).not.toBeNull();
  expect(cred?.provider).toBe("openai-compatible");
  expect(cred?.access).toBe("sk-user-key"); // the user's key reaches auth.json
  expect(cred?.kind).toBe("api_key");
});

test("active openai-compatible with NO endpoint fails LOUDLY — never a silent Codex substitution", async () => {
  const { deps, objects } = makeDeps();
  await setActiveProvider(objects, "openai-compatible");
  turnBodies = [];

  await expect(
    dispatchTurn(deps, ws, agent, "c1", "hi", undefined),
  ).rejects.toThrow(/endpoint/i);
  // No turn was dispatched at all — not to Codex, not to anything.
  expect(turnBodies).toHaveLength(0);
});

test("a keyless endpoint serves the local placeholder key (pi needs SOME key)", async () => {
  const { deps, objects } = makeDeps();
  const channel = new TurnChannel(deps);
  await channel.saveCustomEndpoint(ctx, {
    baseUrl: "https://box.example.com/v1",
    model: "my-model",
  });
  await setActiveProvider(objects, "openai-compatible");
  turnBodies = [];

  await driveTurn(deps);

  const cred = turnBodies[0]?.credential as Record<string, unknown> | null;
  expect(cred?.provider).toBe("openai-compatible");
  expect(cred?.access).toBe("houston-local");
});

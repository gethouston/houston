import type { Server } from "node:http";
import { getPreference, setPreference } from "@houston/domain";
import type { Capabilities, HoustonEvent } from "@houston/protocol";
import { afterEach, beforeEach, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { EventHub } from "../events/hub";
import type { TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import {
  AGENT_COLORS_PREF_KEY,
  agentColorOrNull,
  clearAgentColor,
  moveAgentColor,
  parseAgentColorMap,
} from "./agent-color";

/**
 * PUT /v1/agents/:id/color — the single-request color write the personal
 * assistant dispatches. The decisive property is WHERE it lands: the same
 * `agent_colors` account preference the app's color sync owns, read back here
 * through `/v1/preferences/agent_colors` exactly as the app reads it. A second
 * store would leave the app and the assistant painting different pictures.
 */

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

let server: Server;
let base = "";
let vfs: MemoryVfs;
let emitted: { userId: string; event: HoustonEvent }[];

const auth = (who = "alice") => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

beforeEach(async () => {
  vfs = new MemoryVfs();
  emitted = [];
  const events: EventHub = {
    emit: (userId, event) => {
      emitted.push({ userId, event });
    },
    subscribe: () => () => {},
  };
  const deps: ControlPlaneDeps = {
    verifier,
    store: new MemoryWorkspaceStore(),
    credentials: new MemoryCredentialStore(),
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    channels: {},
    vfs,
    events,
    capabilities: CAPS,
  };
  server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

/** Create an agent through the wire and return its id. */
async function createAgent(
  body: Record<string, unknown>,
  who = "alice",
): Promise<string> {
  const r = await fetch(`${base}/agents`, {
    method: "POST",
    headers: auth(who),
    body: JSON.stringify(body),
  });
  expect(r.status).toBe(201);
  return String(((await r.json()) as { id: string }).id);
}

function putColor(agentId: string, body: unknown, who = "alice") {
  return fetch(`${base}/v1/agents/${encodeURIComponent(agentId)}/color`, {
    method: "PUT",
    headers: auth(who),
    body: JSON.stringify(body),
  });
}

/** The color map exactly as the app reads it back. */
async function storedColors(who = "alice"): Promise<Record<string, string>> {
  const r = await fetch(`${base}/v1/preferences/${AGENT_COLORS_PREF_KEY}`, {
    headers: auth(who),
  });
  expect(r.status).toBe(200);
  return parseAgentColorMap(
    ((await r.json()) as { value: string | null }).value,
  );
}

test("PUT lands in the agent_colors preference the app reads", async () => {
  const agentId = await createAgent({ name: "Sales" });
  const r = await putColor(agentId, { color: "teal" });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ agentId, color: "teal" });
  expect(await storedColors()).toEqual({ [agentId]: "teal" });
});

test("a second agent's color merges into the map instead of replacing it", async () => {
  const first = await createAgent({ name: "Sales" });
  const second = await createAgent({ name: "Support" });
  expect((await putColor(first, { color: "teal" })).status).toBe(200);
  expect((await putColor(second, { color: "#ff8800" })).status).toBe(200);
  expect(await storedColors()).toEqual({
    [first]: "teal",
    [second]: "#ff8800",
  });
  // Re-coloring one agent leaves the other alone.
  expect((await putColor(first, { color: "violet" })).status).toBe(200);
  expect(await storedColors()).toEqual({
    [first]: "violet",
    [second]: "#ff8800",
  });
});

test("a write repaints the app: AgentsChanged for the workspace owner", async () => {
  const agentId = await createAgent({ name: "Sales" });
  emitted = [];
  await putColor(agentId, { color: "teal" });
  expect(emitted).toHaveLength(1);
  expect(emitted[0]?.userId).toBe("alice");
  expect(emitted[0]?.event.type).toBe("AgentsChanged");
});

test("an invalid color is a clean 400 and writes nothing", async () => {
  const agentId = await createAgent({ name: "Sales" });
  await putColor(agentId, { color: "teal" });
  for (const bad of [
    { color: "" },
    { color: "   " },
    { color: 7 },
    { color: null },
    { color: ["teal"] },
    { color: "x".repeat(65) },
    {},
  ]) {
    const r = await putColor(agentId, bad);
    expect(r.status).toBe(400);
    expect((await r.json()) as { error: string }).toEqual({
      error: "invalid 'color'",
    });
  }
  expect(await storedColors()).toEqual({ [agentId]: "teal" });
});

test("an unknown agent answers the authz status and writes nothing", async () => {
  const r = await putColor("Work/Sales", { color: "teal" });
  expect(r.status).toBe(404);
  expect(await storedColors()).toEqual({});
});

test("another user's agent is refused, and their map is untouched", async () => {
  const bobAgent = await createAgent({ name: "Bobs" }, "bob");
  const r = await putColor(bobAgent, { color: "teal" }, "alice");
  expect(r.status).toBe(403);
  expect(await storedColors("bob")).toEqual({});
  expect(await storedColors("alice")).toEqual({});
});

test("a non-PUT method on the color path is 405, not a runtime proxy", async () => {
  const agentId = await createAgent({ name: "Sales" });
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    const r = await fetch(
      `${base}/v1/agents/${encodeURIComponent(agentId)}/color`,
      { method, headers: auth() },
    );
    expect(r.status).toBe(405);
    expect((await r.json()) as { error: string }).toEqual({
      error: "method not allowed",
    });
  }
});

test("POST /agents stores a create-time color in the same map", async () => {
  const colored = await createAgent({ name: "Sales", color: "teal" });
  expect(await storedColors()).toEqual({ [colored]: "teal" });
});

test("POST /agents without a usable color stores nothing", async () => {
  await createAgent({ name: "Sales" });
  expect(await storedColors()).toEqual({});
  // A malformed color is cosmetic: the agent is still created, 201, uncolored.
  await createAgent({ name: "Support", color: 7 });
  await createAgent({ name: "Ops", color: "" });
  expect(await storedColors()).toEqual({});
});

test("parseAgentColorMap keeps only usable string entries", () => {
  expect(parseAgentColorMap(null)).toEqual({});
  expect(parseAgentColorMap("")).toEqual({});
  expect(parseAgentColorMap("{not json")).toEqual({});
  expect(parseAgentColorMap("[]")).toEqual({});
  expect(parseAgentColorMap('"teal"')).toEqual({});
  expect(parseAgentColorMap("null")).toEqual({});
  expect(
    parseAgentColorMap(
      JSON.stringify({
        a: "teal",
        b: 7,
        c: "",
        d: null,
        e: { nested: true },
        f: "x".repeat(65),
        g: "x".repeat(64),
      }),
    ),
  ).toEqual({ a: "teal", g: "x".repeat(64) });
});

test("agentColorOrNull accepts a trimmed non-empty short string only", () => {
  expect(agentColorOrNull("teal")).toBe("teal");
  expect(agentColorOrNull("  teal  ")).toBe("teal");
  expect(agentColorOrNull("#ff8800")).toBe("#ff8800");
  expect(agentColorOrNull("x".repeat(64))).toBe("x".repeat(64));
  expect(agentColorOrNull("x".repeat(65))).toBeNull();
  expect(agentColorOrNull("")).toBeNull();
  expect(agentColorOrNull("   ")).toBeNull();
  expect(agentColorOrNull(undefined)).toBeNull();
  expect(agentColorOrNull(null)).toBeNull();
  expect(agentColorOrNull(7)).toBeNull();
  expect(agentColorOrNull(["teal"])).toBeNull();
});

/**
 * The id-lifecycle helpers, against a real preferences doc. A local agent's id
 * IS its workspace path, so a rename changes it and a deleted id can be reused
 * — the map has to follow both or an agent wears a color that is not its own.
 */
async function mapAfter(
  seed: Record<string, string>,
  edit: (vfs: MemoryVfs) => Promise<unknown>,
): Promise<Record<string, string>> {
  const vfs = new MemoryVfs();
  await setPreference(vfs, "ws", AGENT_COLORS_PREF_KEY, JSON.stringify(seed));
  await edit(vfs);
  return parseAgentColorMap(
    await getPreference(vfs, "ws", AGENT_COLORS_PREF_KEY),
  );
}

test("moveAgentColor carries the entry to the renamed agent's id", async () => {
  expect(
    await mapAfter({ "W/Bob": "forest", "W/Ada": "teal" }, (vfs) =>
      moveAgentColor(vfs, "ws", "W/Bob", "W/Robert"),
    ),
  ).toEqual({ "W/Robert": "forest", "W/Ada": "teal" });
});

test("moveAgentColor leaves the map alone when there is nothing to move", async () => {
  const untouched = { "W/Ada": "teal" };
  expect(
    await mapAfter(untouched, (vfs) =>
      moveAgentColor(vfs, "ws", "W/Bob", "W/Robert"),
    ),
  ).toEqual(untouched);
  expect(
    await mapAfter(untouched, (vfs) =>
      moveAgentColor(vfs, "ws", "W/Ada", "W/Ada"),
    ),
  ).toEqual(untouched);
});

test("clearAgentColor drops only the deleted agent's entry", async () => {
  expect(
    await mapAfter({ "W/Bob": "forest", "W/Ada": "teal" }, (vfs) =>
      clearAgentColor(vfs, "ws", "W/Bob"),
    ),
  ).toEqual({ "W/Ada": "teal" });
  expect(
    await mapAfter({ "W/Ada": "teal" }, (vfs) =>
      clearAgentColor(vfs, "ws", "W/Bob"),
    ),
  ).toEqual({ "W/Ada": "teal" });
});

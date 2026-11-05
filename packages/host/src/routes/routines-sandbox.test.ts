import type { IncomingMessage, ServerResponse } from "node:http";
import {
  loadRoutines,
  saveActivities,
  saveConfig,
  saveRoutines,
} from "@houston/domain";
import type {
  Activity,
  HoustonEvent,
  Routine,
  TurnLimits,
} from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { LocalPaths } from "../paths";
import type { CredentialVault } from "../ports";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { CONVERSATION_ID_HEADER } from "./learnings-sandbox";
import { type LiveTurnPin, liveTurns } from "./live-turn";
import { createRoutineChecked } from "./routine-write";
import { handleSandboxRoutines } from "./routines-sandbox";

/**
 * Chat-created routines inherit the authoring provider, with cheaper defaults
 * for unattended Anthropic and Codex runs. Explicit models and updates retain
 * the user's choice; unpinned chats fall back to the agent configuration.
 */

const paths = new LocalPaths();

let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let ws: Workspace;
let agent: Agent;
let root: string;
let events: HoustonEvent[];

const vault: CredentialVault = {
  sandboxToken: () => "sb",
  validateSandboxToken: (token) =>
    token === "sb-good" ? { workspaceId: ws.id, agentId: agent.id } : null,
};

function fakeReq(
  body: unknown,
  headers: Record<string, string>,
): IncomingMessage {
  const buf = Buffer.from(JSON.stringify(body));
  return {
    headers,
    async *[Symbol.asyncIterator]() {
      if (buf.byteLength) yield buf;
    },
  } as unknown as IncomingMessage;
}

function fakeRes() {
  const captured: { status: number; body: unknown } = { status: 0, body: null };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return res;
    },
    end(chunk?: Buffer) {
      captured.body = chunk ? JSON.parse(chunk.toString("utf8")) : null;
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

const BASE = {
  name: "Inbox digest",
  prompt: "Summarize every new email.",
  schedule: "0 9 * * *",
};

async function save(
  body: Record<string, unknown>,
  opts: {
    /** The pair the send that started the authoring turn asked for. */
    pin?: LiveTurnPin;
    /** Call as a runtime with no turn of the host's running behind it. */
    noLiveTurn?: boolean;
    conversationId?: string;
    actingAs?: string;
    spoofedActingAs?: string;
    gatewayFronted?: boolean;
    triggersEnabled?: boolean;
    /** The plan limits the host recorded on the authoring turn. */
    limits?: TurnLimits;
  } = {},
) {
  const headers: Record<string, string> = {
    authorization: "Bearer sb-good",
    [CONVERSATION_ID_HEADER]: opts.conversationId ?? "activity-1",
  };
  if (opts.spoofedActingAs)
    headers["x-houston-acting-as"] = opts.spoofedActingAs;
  liveTurns.forget(agent.id);
  if (!opts.noLiveTurn)
    liveTurns.start(
      agent.id,
      opts.conversationId ?? "activity-1",
      "execute",
      { actingAs: opts.actingAs, limits: opts.limits },
      opts.pin,
    );
  const { res, captured } = fakeRes();
  const handled = await handleSandboxRoutines(
    {
      vault,
      store,
      vfs,
      paths,
      gatewayFronted: opts.gatewayFronted,
      triggersEnabled: opts.triggersEnabled,
      events: {
        emit: (_userId: string, event: HoustonEvent) => events.push(event),
      } as never,
    },
    "POST",
    "/sandbox/routines/save",
    new URL("http://host/sandbox/routines/save"),
    fakeReq(body, headers),
    res,
  );
  return { handled, ...captured };
}

const REFUSAL =
  "A mission another AI Employee gave you can't set up routines. Finish the mission, or ask the user to set this up from a chat.";

function actingToken(dlg?: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: "alice", ...(dlg ? { dlg } : {}) }),
  ).toString("base64url");
  return `acting-v1.${payload}.signature`;
}

const TRIGGER = {
  toolkit: "gmail",
  trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
  trigger_config: {},
};

test.each([
  ["schedule", BASE],
  ["event trigger", { ...BASE, schedule: undefined, trigger: TRIGGER }],
])("a delegated gateway turn cannot create a %s routine", async (_kind, body) => {
  const r = await save(body, {
    gatewayFronted: true,
    triggersEnabled: true,
    actingAs: actingToken("delegator"),
  });
  expect(r).toMatchObject({
    status: 409,
    body: { code: "mission_depth", error: REFUSAL },
  });
  expect(await onDisk()).toEqual([]);
  expect(events).toEqual([]);
});

test.each([
  ["schedule", { prompt: "Changed" }],
  ["event trigger", { schedule: null, trigger: TRIGGER }],
])("a delegated gateway turn cannot update a %s routine", async (_kind, update) => {
  const created = await save(BASE);
  const original = await onDisk();
  events = [];
  const r = await save(
    { id: (created.body as Routine).id, ...update },
    {
      gatewayFronted: true,
      triggersEnabled: true,
      actingAs: actingToken("delegator"),
    },
  );
  expect(r).toMatchObject({
    status: 409,
    body: { code: "mission_depth", error: REFUSAL },
  });
  expect(await onDisk()).toEqual(original);
  expect(events).toEqual([]);
});

test("a local delegated mission cannot create or update a routine", async () => {
  const created = await save(BASE);
  const original = await onDisk();
  events = [];
  const mission: Activity = {
    id: "child",
    title: "Delegated",
    description: "",
    status: "running",
    session_key: "conv-child",
    origin_session_key: "conv-parent",
  };
  await saveActivities(vfs, root, [mission]);
  for (const body of [
    BASE,
    { id: (created.body as Routine).id, prompt: "Changed" },
  ]) {
    const r = await save(body, { conversationId: "conv-child" });
    expect(r).toMatchObject({
      status: 409,
      body: { code: "mission_depth", error: REFUSAL },
    });
  }
  expect(await onDisk()).toEqual(original);
  expect(events).toEqual([]);
});

test("an ordinary chat and a human-started mission may save routines", async () => {
  const chat = await save(BASE, {
    gatewayFronted: true,
    actingAs: actingToken(),
  });
  expect(chat.status).toBe(201);
  await saveActivities(vfs, root, [
    {
      id: "human",
      title: "Human mission",
      description: "",
      status: "running",
      session_key: "conv-human",
    },
  ]);
  const mission = await save(
    { ...BASE, name: "Another" },
    { conversationId: "conv-human" },
  );
  expect(mission.status).toBe(201);
  expect(await onDisk()).toHaveLength(2);
});

test("a delegated mission may pause an existing routine", async () => {
  const created = await save(BASE);
  await saveActivities(vfs, root, [
    {
      id: "child",
      title: "Delegated",
      description: "",
      status: "running",
      session_key: "conv-child",
      origin_session_key: "conv-parent",
    },
  ]);
  const r = await save(
    { id: (created.body as Routine).id, enabled: false },
    {
      conversationId: "conv-child",
    },
  );
  expect(r.status).toBe(200);
  expect((await onDisk())[0]?.enabled).toBe(false);
});

async function onDisk(): Promise<Routine[]> {
  return (await loadRoutines(vfs, root)).items;
}

beforeEach(async () => {
  store = new MemoryWorkspaceStore({ defaultRuntime: "local" });
  vfs = new MemoryVfs();
  events = [];
  ws = await store.getOrCreatePersonalWorkspace("alice");
  agent = await store.createAgent({ workspaceId: ws.id, name: "Test" });
  root = paths.agentRoot(ws, agent);
});

test("a new Anthropic routine uses Sonnet instead of its authoring Opus model", async () => {
  const r = await save(BASE, {
    pin: { provider: "anthropic", model: "claude-opus-5-5", effort: "medium" },
  });
  expect(r.status).toBe(201);
  const [routine] = await onDisk();
  expect(routine).toMatchObject({
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    effort: "medium",
  });
  expect(events).toEqual([{ type: "RoutinesChanged", agentPath: agent.id }]);
});

test("the stamped provider is stored in pi's canonical dialect", async () => {
  // The composer speaks display ids: "openai" is Codex on the wire.
  await save(BASE, { pin: { provider: "openai", model: "gpt-5.5" } });
  expect((await onDisk())[0]).toMatchObject({
    provider: "openai-codex",
    model: "gpt-6.1-terra",
  });
});

test("a provider the agent named explicitly is kept", async () => {
  await save(
    { ...BASE, provider: "google", model: "gemini-3.8-flash" },
    { pin: { provider: "anthropic", model: "claude-sonnet-5" } },
  );
  expect((await onDisk())[0]).toMatchObject({
    provider: "google",
    model: "gemini-3.8-flash",
    effort: null,
  });
});

test("a send with no pin or configured provider leaves the routine unpinned", async () => {
  await save(BASE);
  expect((await onDisk())[0]).toMatchObject({
    provider: null,
    model: null,
    effort: null,
  });
});

test("a save with no recorded turn behind it stays unpinned", async () => {
  const r = await save(BASE, { noLiveTurn: true });
  expect(r.status).toBe(201);
  expect((await onDisk())[0]?.provider).toBeNull();
});

test("an update never re-pins: a routine that follows the agent keeps following it", async () => {
  const created = await save(BASE);
  const id = (created.body as Routine).id;
  await saveRoutines(vfs, root, await onDisk());
  const r = await save(
    { id, prompt: "Summarize only unread email." },
    { pin: { provider: "anthropic", model: "claude-sonnet-5" } },
  );
  expect(r.status).toBe(200);
  const [routine] = await onDisk();
  expect(routine?.prompt).toBe("Summarize only unread email.");
  expect(routine?.provider).toBeNull();
});

test("a turn under a plan floor cannot save a routine that fires more often", async () => {
  const r = await save(
    { ...BASE, schedule: "*/5 * * * *" },
    {
      gatewayFronted: true,
      actingAs: actingToken(),
      limits: { routineMinIntervalMinutes: 15 },
    },
  );
  expect(r).toMatchObject({
    status: 400,
    body: {
      code: "plan_min_interval",
      minIntervalMinutes: 15,
      error: expect.stringContaining("at most once every 15 minutes"),
    },
  });
  expect(await onDisk()).toEqual([]);
  expect(events).toEqual([]);
});

test("the same turn may save at the floor, and an update is held to it too", async () => {
  const opts = {
    gatewayFronted: true,
    actingAs: actingToken(),
    limits: { routineMinIntervalMinutes: 15 },
  };
  const created = await save({ ...BASE, schedule: "*/15 * * * *" }, opts);
  expect(created.status).toBe(201);
  const id = (created.body as Routine).id;
  const tightened = await save({ id, schedule: "*/5 * * * *" }, opts);
  expect(tightened).toMatchObject({
    status: 400,
    body: { code: "plan_min_interval" },
  });
  expect((await onDisk())[0]?.schedule).toBe("*/15 * * * *");
});

test("a turn with no recorded limits keeps any cadence", async () => {
  const r = await save(
    { ...BASE, schedule: "*/5 * * * *" },
    { gatewayFronted: true, actingAs: actingToken() },
  );
  expect(r.status).toBe(201);
});

test("limits the runtime puts in the save body itself are ignored", async () => {
  // Only the host's record of the turn carries limits; the runtime's request
  // could name any, so a floor there is neither honored nor saved.
  const r = await save(
    {
      ...BASE,
      schedule: "*/5 * * * *",
      limits: { routineMinIntervalMinutes: 60 },
    },
    { gatewayFronted: true, actingAs: actingToken() },
  );
  expect(r.status).toBe(201);
  expect(await onDisk()).toHaveLength(1);
  expect((await onDisk())[0]).not.toHaveProperty("limits");
});

test.each([
  ["medium", "low"],
  ["high", "low"],
  ["xhigh", "max"],
  ["max", "max"],
  ["low", "low"],
])("a Codex routine uses Terra with valid effort instead of Astra's %s", async (effort, expected) => {
  await save(BASE, {
    pin: { provider: "openai-codex", model: "gpt-6-astra", effort },
  });
  expect((await onDisk())[0]).toMatchObject({
    provider: "openai-codex",
    model: "gpt-6.1-terra",
    effort: expected,
  });
});

test("another provider keeps its authoring model and effort", async () => {
  await save(BASE, {
    pin: { provider: "google", model: "gemini-3.5-pro", effort: "high" },
  });
  expect((await onDisk())[0]).toMatchObject({
    provider: "google",
    model: "gemini-3.5-pro",
    effort: "high",
  });
});

test("an explicit model overrides the new routine default", async () => {
  await save(
    { ...BASE, model: "claude-opus-5-5" },
    {
      pin: { provider: "anthropic", model: "claude-opus-5-5", effort: "high" },
    },
  );
  expect((await onDisk())[0]).toMatchObject({
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "high",
  });
});

test("chat model and effort edits change only the passed fields", async () => {
  const pin = {
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "high",
  };
  const created = await save(
    { ...BASE, model: "claude-opus-5-5", effort: "max" },
    { pin },
  );
  expect(created.status).toBe(201);
  const id = (created.body as Routine).id;
  expect((await onDisk())[0]).toMatchObject({
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "max",
  });
  expect((await save({ id, model: "claude-sonnet-5-5" }, { pin })).status).toBe(
    200,
  );
  expect((await onDisk())[0]).toMatchObject({
    model: "claude-sonnet-5-5",
    effort: "max",
  });
  expect((await save({ id, effort: "low" }, { pin })).status).toBe(200);
  expect((await save({ id, prompt: "Only unread" }, { pin })).status).toBe(200);
  expect((await onDisk())[0]).toMatchObject({
    model: "claude-sonnet-5-5",
    effort: "low",
  });
});

test("chat refuses a model outside its provider on create and update", async () => {
  const pin = { provider: "anthropic", model: "claude-opus-5-5" };
  const refused = await save({ ...BASE, model: "gpt-6.1-terra" }, { pin });
  expect(refused.status).toBe(400);
  expect(await onDisk()).toEqual([]);
  const created = await save(BASE, { pin });
  const id = (created.body as Routine).id;
  const original = await onDisk();
  expect((await save({ id, model: "made-up-model" }, { pin })).status).toBe(
    400,
  );
  expect(await onDisk()).toEqual(original);
});

test("updating an existing Opus routine never changes its model", async () => {
  await save({
    ...BASE,
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "high",
  });
  const [original] = await onDisk();
  await save(
    { id: original?.id, prompt: "Only unread emails." },
    {
      pin: { provider: "openai-codex", model: "gpt-6-astra", effort: "xhigh" },
    },
  );
  expect((await onDisk())[0]).toMatchObject({
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "high",
    prompt: "Only unread emails.",
  });
});

test.each([
  [
    "anthropic",
    "claude-opus-5-5",
    "medium",
    "anthropic",
    "claude-sonnet-5-5",
    "medium",
  ],
  [
    "openai-codex",
    "gpt-6-astra",
    "high",
    "openai-codex",
    "gpt-6.1-terra",
    "low",
  ],
  [
    "openai-codex",
    "gpt-6-astra",
    "xhigh",
    "openai-codex",
    "gpt-6.1-terra",
    "max",
  ],
  [
    "claude",
    "claude-opus-5-5",
    "high",
    "anthropic",
    "claude-sonnet-5-5",
    "high",
  ],
  ["openai", "gpt-6-astra", "medium", "openai-codex", "gpt-6.1-terra", "low"],
  ["google", "gemini-3.5-pro", "high", "google", "gemini-3.5-pro", "high"],
  ["qwen", "qwen3.7-max", "high", "qwen", "qwen3.7-max", "high"],
  ["xai", "grok-4", "high", "xai", "grok-4", "high"],
  [
    "groq",
    "llama-3.3-70b-versatile",
    "high",
    "groq",
    "llama-3.3-70b-versatile",
    "high",
  ],
])("an unpinned chat uses configured %s/%s at %s for routine creation", async (provider, model, effort, expectedProvider, expectedModel, expectedEffort) => {
  await saveConfig(vfs, root, { provider, model, effort });
  const result = await save(BASE);
  expect(result.status).toBe(201);
  expect((await onDisk())[0]).toMatchObject({
    provider: expectedProvider,
    model: expectedModel,
    effort: expectedEffort,
  });
  expect(events).toEqual([{ type: "RoutinesChanged", agentPath: agent.id }]);
});

test.each([
  "qwen",
  "xai",
  "groq",
])("a turn pinned to %s can create a routine", async (provider) => {
  expect((await save(BASE, { pin: { provider } })).status).toBe(201);
  expect((await onDisk())[0]?.provider).toBe(provider);
});

test("an explicit typo provider is refused without saving or emitting", async () => {
  const response = await save({ ...BASE, provider: "anthorpic" });
  expect(response).toMatchObject({
    status: 400,
    body: { error: "unknown provider: anthorpic" },
  });
  expect(await onDisk()).toEqual([]);
  expect(events).toEqual([]);
});

test.each([
  ["anthropic", "claude-opus-5-5"],
  ["openai-codex", "gpt-6-astra"],
])("an explicit model wins over the configured %s routine default", async (provider, model) => {
  await saveConfig(vfs, root, { provider, model, effort: "high" });
  expect((await save({ ...BASE, model })).status).toBe(201);
  expect((await onDisk())[0]).toMatchObject({
    provider,
    model,
    effort: "high",
  });
});

test("an explicit provider or turn pin takes precedence over the configured agent", async () => {
  await saveConfig(vfs, root, {
    provider: "google",
    model: "gemini-3.5-pro",
    effort: "high",
  });
  await save(BASE, {
    pin: { provider: "anthropic", model: "claude-opus-5-5", effort: "medium" },
  });
  await save({ ...BASE, provider: "openai-codex" });
  expect(await onDisk()).toMatchObject([
    { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" },
    { provider: "openai-codex", model: "gpt-6.1-terra", effort: "low" },
  ]);
});

test("configured defaults never re-pin an existing routine on update", async () => {
  await save({
    ...BASE,
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "high",
  });
  await save(BASE);
  const originals = await onDisk();
  await saveConfig(vfs, root, {
    provider: "openai-codex",
    model: "gpt-6-astra",
    effort: "xhigh",
  });
  for (const original of originals) {
    expect(
      (await save({ id: original.id, prompt: "Only unread" })).status,
    ).toBe(200);
  }
  expect(await onDisk()).toMatchObject(
    originals.map(({ provider, model, effort }) => ({
      provider,
      model,
      effort,
      prompt: "Only unread",
    })),
  );
});

test("UI creation without a provider stays unpinned despite the configured agent", async () => {
  await saveConfig(vfs, root, {
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "high",
  });
  const result = await createRoutineChecked(vfs, root, ws.id, BASE, {
    triggersEnabled: false,
    nowIso: "2026-01-01T00:00:00Z",
  });
  expect(result).toMatchObject({
    routine: { provider: null, model: null, effort: null },
  });
});

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { runWithConversationId } from "../session/conversation-context";
import { COORDINATOR_TOOL_NAMES } from "../session/tool-selection-coordinator";
import type { SandboxFetch } from "../session/tools/sandbox-fetch";
import { appendUserMessageAt } from "../store/conversation-file";
import type { TurnSessionRequest } from "./turn-session";
import { buildTurnCommonTools, buildTurnToolSelection } from "./turn-toolset";

/**
 * A pool worker serves whatever turn arrives, so the AI Manager's surface is
 * decided by the TURN (the gateway marks it), never by the worker's process:
 * one worker builds the coordinator's tools for Houston's turn and an
 * ordinary agent's tools for the next.
 */

const okCall: SandboxFetch = async () => Response.json({});

function turn(
  overrides: Partial<TurnSessionRequest> = {},
  call: SandboxFetch = okCall,
): TurnSessionRequest {
  return {
    conversationId: "assistant",
    text: "hello",
    provider: "openai-codex",
    emit: () => undefined,
    signal: undefined,
    turnId: "t1",
    role: "coordinator",
    // What the gateway grants Houston's turn: no integrations, no code-run.
    grant: { scopes: ["agent-writes"] },
    sandbox: { call },
    ...overrides,
  };
}

const dataDir = () => mkdtempSync(join(tmpdir(), "coordinator-turn-"));
const dirs = () => ({ dataDir: dataDir(), workspaceDir: dataDir() });
const names = (tools: { name: string }[]) => tools.map((tool) => tool.name);

test("a coordinator turn's allowlist is the coordinator surface", () => {
  const selected = buildTurnToolSelection(turn(), "local").toolNames;
  expect(selected).toEqual(
    expect.arrayContaining([
      "houston_capabilities",
      "houston_describe",
      "houston_call",
      "houston_recall",
      "start_mission",
      "list_missions",
      "read_mission",
      "update_mission_status",
      "save_learning",
      "request_hands_on",
      "request_connection",
      "request_credential",
    ]),
  );
  for (const name of selected) expect(COORDINATOR_TOOL_NAMES).toContain(name);
  for (const name of [
    "bash",
    "run_code",
    "edit",
    "save_routine",
    "integration_execute",
  ]) {
    expect(selected).not.toContain(name);
  }
});

test("the same worker builds an ordinary turn's surface for an ordinary turn", () => {
  const selected = buildTurnToolSelection(
    turn({ role: undefined }),
    "local",
  ).toolNames;
  expect(selected).toContain("bash");
  expect(selected).not.toContain("houston_call");
  expect(selected).not.toContain("start_mission");
});

test("a coordinator turn with no facade keeps the clamp and gets no family", () => {
  const bare = turn({ grant: undefined, sandbox: undefined });
  const selected = buildTurnToolSelection(bare, "local").toolNames;
  for (const name of selected) expect(COORDINATOR_TOOL_NAMES).toContain(name);
  expect(selected).not.toContain("houston_call");
  expect(selected).not.toContain("bash");
  expect(buildTurnCommonTools(bare, null, dirs())).not.toContainEqual(
    expect.objectContaining({ name: "houston_call" }),
  );
});

test("every coordinator tool the allowlist names is registered", () => {
  const coordinator = turn();
  const selected = buildTurnToolSelection(coordinator, "local").toolNames;
  const registered = names(buildTurnCommonTools(coordinator, null, dirs()));
  for (const name of selected.filter((n) => n !== "read")) {
    expect(registered).toContain(name);
  }
});

test("houston_call and the mission tools ride THIS turn's facade", async () => {
  const paths: string[] = [];
  const call: SandboxFetch = async (path) => {
    paths.push(path);
    return Response.json({ items: [] });
  };
  const tools = buildTurnCommonTools(turn({}, call), null, dirs());
  const houstonCall = tools.find((tool) => tool.name === "houston_call");
  const list = tools.find((tool) => tool.name === "list_missions");
  await runWithConversationId("assistant", async () => {
    await houstonCall?.execute(
      "c1",
      { operation: "listAgents", params: {} },
      undefined,
      undefined,
      undefined as never,
    );
    await list?.execute(
      "c2",
      { agent: "Writer" },
      undefined,
      undefined,
      undefined as never,
    );
  });
  expect(paths).toContain("/sandbox/assistant/call");
  expect(paths.some((path) => path.startsWith("/sandbox/missions"))).toBe(true);
});

test("houston_recall searches this turn's own transcript", async () => {
  const dir = dataDir();
  appendUserMessageAt(
    join(dir, "conversations"),
    "assistant",
    "my dentist is Dr. Okafor",
  );
  const recall = buildTurnCommonTools(turn(), null, {
    dataDir: dir,
    workspaceDir: dataDir(),
  }).find((tool) => tool.name === "houston_recall");
  const result = await runWithConversationId("assistant", () =>
    recall?.execute(
      "r1",
      { query: "Okafor" },
      undefined,
      undefined,
      undefined as never,
    ),
  );
  const text = result?.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
  expect(text).toContain("Okafor");
});

test("houston_recall searches this turn's own memories, not the process's", async () => {
  const workspaceDir = dataDir();
  mkdirSync(join(workspaceDir, ".houston", "learnings"), { recursive: true });
  writeFileSync(
    join(workspaceDir, ".houston", "learnings", "learnings.json"),
    JSON.stringify([
      { id: "m1", text: "Dentist is Dr. Okafor", created_at: "2026-01-01" },
    ]),
  );
  const recall = buildTurnCommonTools(turn(), null, {
    dataDir: dataDir(),
    workspaceDir,
  }).find((tool) => tool.name === "houston_recall");
  const result = await runWithConversationId("assistant", () =>
    recall?.execute(
      "r1",
      { query: "okafor" },
      undefined,
      undefined,
      undefined as never,
    ),
  );
  const text = result?.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
  expect(text).toContain("[current memory] Dentist is Dr. Okafor");
});

test("a provider pin is left for the host to judge, not the empty process store", async () => {
  const bodies: unknown[] = [];
  const call: SandboxFetch = async (path, init) => {
    if (path === "/sandbox/missions/start")
      bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ id: "m1" });
  };
  const tools = buildTurnCommonTools(turn({}, call), null, dirs());
  const start = tools.find((tool) => tool.name === "start_mission");
  await runWithConversationId("assistant", () =>
    start?.execute(
      "s1",
      {
        agent: "Dobby",
        title: "Research",
        prompt: "Look into it",
        provider: "openai-codex",
      },
      undefined,
      undefined,
      undefined as never,
    ),
  );
  expect(bodies).toContainEqual(
    expect.objectContaining({ provider: "openai-codex" }),
  );
});

test("a provider the worker never heard of locally can still be pinned", async () => {
  const bodies: unknown[] = [];
  const call: SandboxFetch = async (path, init) => {
    if (path === "/sandbox/missions/start")
      bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ id: "m1" });
  };
  const start = buildTurnCommonTools(turn({}, call), null, dirs()).find(
    (tool) => tool.name === "start_mission",
  );
  await runWithConversationId("assistant", () =>
    start?.execute(
      "s1",
      { agent: "Dobby", title: "Research", prompt: "Look", provider: "groq" },
      undefined,
      undefined,
      undefined as never,
    ),
  );
  expect(bodies).toContainEqual(expect.objectContaining({ provider: "groq" }));
});

test("Houston's request cards do not wait for any grant scope", () => {
  const registered = names(
    buildTurnCommonTools(turn({ grant: { scopes: [] } }), null, dirs()),
  );
  expect(registered).toContain("request_provider_connection");
  expect(registered).toContain("request_hands_on");
});

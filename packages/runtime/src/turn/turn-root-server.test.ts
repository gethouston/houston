import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { buildSystemPrompt } from "../backends/claude/system-prompt";
import { createTurnServer } from "./server";
import { conversationTurnRoot } from "./turn-root";
import type { TurnRunner } from "./turn-session";

const servers: Server[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) server.close();
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return `http://127.0.0.1:${address.port}`;
}

function seedAgentStore(): LocalDirStore {
  const storeRoot = mkdtempSync(join(tmpdir(), "turn-root-store-"));
  const agent = join(storeRoot, "ws", "w1", "agent-1", "workspaces", "W", "A");
  const settings = join(agent, ".houston", "runtime", "settings.json");
  mkdirSync(dirname(settings), { recursive: true });
  writeFileSync(settings, "{}");
  writeFileSync(join(agent, "CLAUDE.md"), "You run the sales desk.");
  const skill = join(agent, ".agents", "skills", "weekly-report", "SKILL.md");
  mkdirSync(dirname(skill), { recursive: true });
  writeFileSync(
    skill,
    "---\nname: weekly-report\ndescription: Weekly sales report\n---\n\nDo it.\n",
  );
  return new LocalDirStore(storeRoot);
}

interface SeenTurn {
  root: string;
  prompt: string;
}

function recordingRunner(seen: SeenTurn[]): TurnRunner {
  return async (directories, turn) => {
    seen.push({
      root: directories.turnRoot,
      prompt: buildSystemPrompt(
        directories.workspaceDir,
        "You are Houston.",
        turn.mode,
        turn.context,
      ),
    });
    return {};
  };
}

async function runTurn(base: string, conversationId: string): Promise<void> {
  const response = await fetch(`${base}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "w1",
      agentId: "agent-1",
      conversationId,
      text: "hello",
      gcsPrefix: "ws/w1/agent-1",
      credential: {
        provider: "anthropic",
        access: "access-token",
        expires: Date.now() + 60_000,
      },
    }),
  });
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('"type":"done"');
}

test("every turn of a conversation runs in one root, removed after each turn", async () => {
  const conversationId = `c-${randomUUID()}`;
  const seen: SeenTurn[] = [];
  const base = await listen(
    createTurnServer({
      store: seedAgentStore(),
      token: "",
      runTurn: recordingRunner(seen),
    }),
  );

  await runTurn(base, conversationId);
  expect(existsSync(seen[0]?.root ?? "")).toBe(false);
  await runTurn(base, conversationId);

  const stable = conversationTurnRoot({
    workspaceId: "w1",
    agentId: "agent-1",
    conversationId,
  });
  expect(seen.map((turn) => turn.root)).toEqual([stable, stable]);
  expect(seen[0]?.prompt).toContain(stable);
  expect(seen[1]?.prompt).toBe(seen[0]?.prompt);
  expect(existsSync(stable)).toBe(false);
});

test("a turn whose conversation root is taken runs in a fresh root and cleans only that", async () => {
  const conversationId = `c-${randomUUID()}`;
  const stable = conversationTurnRoot({
    workspaceId: "w1",
    agentId: "agent-1",
    conversationId,
  });
  mkdirSync(stable);
  writeFileSync(join(stable, "leftover.txt"), "previous turn");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  try {
    const seen: SeenTurn[] = [];
    const base = await listen(
      createTurnServer({
        store: seedAgentStore(),
        token: "",
        runTurn: recordingRunner(seen),
      }),
    );

    await runTurn(base, conversationId);

    const fallback = seen[0]?.root ?? "";
    expect(fallback).not.toBe(stable);
    expect(dirname(fallback)).toBe(tmpdir());
    expect(existsSync(fallback)).toBe(false);
    expect(existsSync(join(stable, "leftover.txt"))).toBe(true);
  } finally {
    rmSync(stable, { recursive: true, force: true });
  }
});

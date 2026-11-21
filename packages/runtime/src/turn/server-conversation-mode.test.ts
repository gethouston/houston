import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createTurnServer } from "./server";
import type { TurnRunner } from "./turn-session";

const storeRoot = mkdtempSync(join(tmpdir(), "houston-turn-mode-"));
const store = new LocalDirStore(storeRoot);
const PREFIX = "ws/w1/agent-1";

function seedBoard(cards: unknown): void {
  const dir = join(
    storeRoot,
    ...PREFIX.split("/"),
    "workspace",
    ".houston",
    "activity",
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "activity.json"), JSON.stringify(cards));
}

let seen: { mode?: string; live?: string } | undefined;
const capture: TurnRunner = async (_layout, turn) => {
  seen = { mode: turn.mode, live: turn.liveMode?.current };
  turn.emit({
    type: "user",
    data: { content: turn.text, ts: 1 },
    turnId: turn.turnId,
  });
  return {};
};

let server: Server;
let base = "";
beforeAll(async () => {
  server = createTurnServer({ store, token: "", runTurn: capture });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => {
  server.close();
  rmSync(storeRoot, { recursive: true, force: true });
});
beforeEach(() => {
  seen = undefined;
});

async function send(over: Record<string, unknown> = {}): Promise<void> {
  const res = await fetch(`${base}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "w1",
      agentId: "agent-1",
      conversationId: "activity-m1",
      text: "next step",
      gcsPrefix: PREFIX,
      credential: { provider: "openai-codex", access: "AT", expires: 1 },
      ...over,
    }),
  });
  await res.text();
}

const card = (mode?: string) => ({
  id: "m1",
  title: "Weekly report",
  description: "",
  status: "done",
  ...(mode ? { mode } : {}),
});

test("a pin-less send runs on the kept mode, live mode included", async () => {
  seedBoard([card("auto")]);
  await send();
  expect(seen).toEqual({ mode: "auto", live: "auto" });
});

test("the send's own mode wins over the kept one", async () => {
  seedBoard([card("auto")]);
  await send({ mode: "plan" });
  expect(seen).toEqual({ mode: "plan", live: "plan" });
});

test("a card with no mode runs Ask first", async () => {
  seedBoard([card()]);
  await send();
  expect(seen).toEqual({ mode: undefined, live: "execute" });
});

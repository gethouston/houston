import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createTurnServer } from "./server";
import type { TurnRunner } from "./turn-session";

const storeRoot = mkdtempSync(join(tmpdir(), "houston-ledger-store-"));
const store = new LocalDirStore(storeRoot);
const PREFIX = "ws/w1/agent-1";
const LEDGER = join(
  storeRoot,
  ...PREFIX.split("/"),
  "data",
  "token-usage.json",
);

const spendingTurn: TurnRunner = async (_layout, turn) => {
  turn.emit({ type: "text", data: "ok", turnId: turn.turnId });
  return {
    spend: {
      provider: "google",
      usage: { context_tokens: 2_000, output_tokens: 30, cached_tokens: 0 },
    },
  };
};

let server: Server;
let base = "";

beforeAll(async () => {
  const seed = join(storeRoot, ...PREFIX.split("/"), "workspace", "notes.txt");
  mkdirSync(join(seed, ".."), { recursive: true });
  writeFileSync(seed, "hi");
  server = createTurnServer({ store, token: "t", runTurn: spendingTurn });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(() => server.close());

const turn = (conversationId: string) =>
  fetch(`${base}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": "t" },
    body: JSON.stringify({
      workspaceId: "w1",
      agentId: "agent-1",
      conversationId,
      text: "hello",
      gcsPrefix: PREFIX,
      credential: {
        provider: "google",
        access: "AIza-test",
        expires: 1750000000000,
        kind: "api_key",
      },
    }),
  }).then((res) => res.text());

test("each turn's spend lands in the agent's ledger, once", async () => {
  expect(await turn("c1")).toContain('"type":"done"');
  expect(await turn("c2")).toContain('"type":"done"');

  const ledger = JSON.parse(readFileSync(LEDGER, "utf8")) as {
    providers: Record<string, unknown>;
  };
  expect(ledger.providers.google).toMatchObject({
    inputTokens: 4_000,
    outputTokens: 60,
    turns: 2,
  });
});

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import type { ChannelCtx } from "../ports";
import { ConnectManager } from "../turn/connect";
import { TurnQuota } from "../turn/quota";
import { TurnRelay } from "../turn/relay";
import { MemoryVfs } from "../vfs";
import { isTurnBusy, TurnFireError } from "./fire-error";
import { TurnChannel } from "./turn";

/**
 * A programmatic fire refused because the agent's one turn slot is taken
 * throws the TYPED busy refusal, so a caller (the first-day start) can tell a
 * turn that is already running from one that could not start at all.
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
const ctx: ChannelCtx = { workspace: ws, agent };

let runtime: Server;
let runtimeUrl = "";
/** Every turn's stream stays open until the suite ends: the slot stays taken. */
const open: (() => void)[] = [];

beforeAll(async () => {
  runtime = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(": connected\n\n");
    open.push(() => res.end());
  });
  await new Promise<void>((r) => runtime.listen(0, "127.0.0.1", () => r()));
  runtimeUrl = `http://127.0.0.1:${(runtime.address() as AddressInfo).port}`;
});

afterAll(() => {
  for (const end of open) end();
  runtime.close();
});

test("a fire while the agent's turn is running throws the typed busy refusal", async () => {
  const credentials = new MemoryCredentialStore();
  await credentials.put({
    workspaceId: ws.id,
    provider: "openai-codex",
    accessToken: "AT",
    refreshToken: "RT",
    accountId: "acct-9",
    expiresAt: Date.now() + 3_600_000,
  });
  const channel = new TurnChannel({
    runtimeUrl,
    turnToken: "turn-secret",
    relay: new TurnRelay(),
    quota: new TurnQuota({ maxConcurrent: 2, perHour: 100 }),
    vfs: new MemoryVfs(),
    credentials,
    connect: new ConnectManager(credentials),
    refresh: async (cred) => cred,
    idToken: async () => "google-id-token",
    codexModels: ["gpt-5.5"],
  });

  await channel.fireTurn(ctx, "c1", "hello");
  const err = await channel.fireTurn(ctx, "c1", "hello again").catch((e) => e);
  expect(err).toBeInstanceOf(TurnFireError);
  expect(isTurnBusy(err)).toBe(true);
  expect(isTurnBusy(new Error("runtime unavailable"))).toBe(false);
  expect(err.runningConversation).toBe("c1");

  // The slot is agent-wide: a fire into another conversation is refused
  // naming the conversation that actually holds it.
  const other = await channel.fireTurn(ctx, "c2", "hi").catch((e) => e);
  expect(isTurnBusy(other)).toBe(true);
  expect(other.runningConversation).toBe("c1");
});

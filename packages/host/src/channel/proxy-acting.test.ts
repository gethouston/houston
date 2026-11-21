import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ROUTINE_FIRE_HEADER } from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import { FakeLauncher } from "../launcher/fake";
import type { ChannelCtx } from "../ports";
import { forward } from "../proxy/route";
import { liveTurns } from "../routes/live-turn";
import { ProxyChannel } from "./proxy";

const ws: Workspace = {
  id: "w1",
  ownerUserId: "alice",
  kind: "personal",
  name: "Personal",
  slug: "alice",
  runtime: "local",
  createdAt: 1,
};
const agent: Agent = { id: "a1", workspaceId: "w1", name: "Sol", createdAt: 1 };
const ctx: ChannelCtx = { workspace: ws, agent };

let runtime: Server;
let runtimeUrl = "";
let seenHeaders: Record<string, string | string[] | undefined>[] = [];
let seenBodies: string[] = [];

beforeAll(async () => {
  runtime = createServer((req, res) => {
    seenHeaders.push({ ...req.headers });
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      seenBodies.push(body);
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((r) => runtime.listen(0, "127.0.0.1", () => r()));
  runtimeUrl = `http://127.0.0.1:${(runtime.address() as AddressInfo).port}`;
});

afterAll(() => runtime.close());

function makeChannel(
  forwardActingHeader: boolean,
  beforeTurn?: () => Promise<void>,
): ProxyChannel {
  return new ProxyChannel({
    launcher: new FakeLauncher({ baseUrl: runtimeUrl, token: "sbx" }),
    proxy: { forward },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader,
    beforeTurn,
  });
}

function serve(
  channel: ProxyChannel,
): Promise<{ base: string; close(): void }> {
  const s = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    const rest = url.pathname.replace(/^\//, "");
    void channel
      .dispatch(ctx, req.method || "GET", rest, url, req, res)
      .catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
  });
  return new Promise((resolve) =>
    s.listen(0, "127.0.0.1", () =>
      resolve({
        base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`,
        close: () => s.close(),
      }),
    ),
  );
}

async function dispatchWithHeader(channel: ProxyChannel) {
  seenHeaders = [];
  const { base, close } = await serve(channel);
  try {
    await fetch(`${base}/conversations/c1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-houston-acting-as": "acting-v1.forged-payload.sig",
      },
      body: JSON.stringify({ text: "hi" }),
    });
  } finally {
    close();
  }
  return seenHeaders[0] ?? {};
}

test("local profile (forwardActingHeader: false): a client-supplied acting-as header is DROPPED", async () => {
  const headers = await dispatchWithHeader(makeChannel(false));
  expect(headers["x-houston-acting-as"]).toBeUndefined();
  expect(headers.authorization).toBe("Bearer sbx");
});

test("gateway-fronted profile (forwardActingHeader: true): the minted acting-as header rides through", async () => {
  const headers = await dispatchWithHeader(makeChannel(true));
  expect(headers["x-houston-acting-as"]).toBe("acting-v1.forged-payload.sig");
});

test("routine creator identity (server-minted acting-user) flows regardless of the flag", async () => {
  for (const flag of [false, true]) {
    seenHeaders = [];
    await makeChannel(flag).fireTurn(ctx, "c1", "run it", undefined, {
      actingUser: "sub-123",
    });
    expect(seenHeaders[0]?.["x-houston-acting-user"]).toBe("sub-123");
    expect(seenHeaders[0]?.["x-houston-acting-as"]).toBeUndefined();
  }
});

test("a fire's nonce rides the message body, so the runtime persists it", async () => {
  seenBodies = [];
  await makeChannel(false).fireTurn(ctx, "c1", "run it", undefined, {
    nonce: "heartbeat-1",
  });
  expect(JSON.parse(seenBodies[0] ?? "{}")).toMatchObject({
    text: "run it",
    nonce: "heartbeat-1",
  });
  seenBodies = [];
  await makeChannel(false).fireTurn(ctx, "c1", "run it");
  expect(JSON.parse(seenBodies[0] ?? "{}")).not.toHaveProperty("nonce");
});

test("interactive and routine turns both refresh shared resources before dispatch", async () => {
  let refreshes = 0;
  const channel = makeChannel(false, async () => {
    refreshes += 1;
  });

  await dispatchWithHeader(channel);
  await channel.fireTurn(ctx, "c1", "run it");

  expect(refreshes).toBe(2);
});

test("a fire records its acting identity and plan limits on the turn it starts", async () => {
  liveTurns.forget(agent.id);
  await makeChannel(true).fireTurn(ctx, "c1", "run it", undefined, {
    actingAs: "acting-v1.payload.sig",
    limits: { routineMinIntervalMinutes: 15 },
  });
  expect(liveTurns.get(agent.id, "c1")).toMatchObject({
    actingAs: "acting-v1.payload.sig",
    limits: { routineMinIntervalMinutes: 15 },
  });
  liveTurns.forget(agent.id);
});

test("only a routine fire carries the routine-fire marker; a client cannot set it", async () => {
  for (const flag of [false, true]) {
    seenHeaders = [];
    const channel = makeChannel(flag);
    await channel.fireTurn(ctx, "c1", "run it", undefined, {
      actingAs: "acting-v1.payload.sig",
      routine: true,
    });
    await channel.fireTurn(ctx, "c1", "first turn", undefined, {
      actingAs: "acting-v1.payload.sig",
    });
    expect(seenHeaders[0]?.[ROUTINE_FIRE_HEADER]).toBe("1");
    expect(seenHeaders[1]?.[ROUTINE_FIRE_HEADER]).toBeUndefined();

    seenHeaders = [];
    const { base, close } = await serve(channel);
    try {
      await fetch(`${base}/conversations/c1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [ROUTINE_FIRE_HEADER]: "1",
        },
        body: JSON.stringify({ text: "hi" }),
      });
    } finally {
      close();
    }
    expect(seenHeaders[0]?.authorization).toBe("Bearer sbx");
    expect(seenHeaders[0]?.[ROUTINE_FIRE_HEADER]).toBeUndefined();
  }
});

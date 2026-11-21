import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import { FakeLauncher } from "../launcher/fake";
import type { ChannelCtx } from "../ports";
import { forward } from "../proxy/route";
import { isRetryableFireError } from "../schedule/fire-outcome";
import { isDialFailure, TurnDeliveryUncertainError } from "./fire-error";
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

let resetting: Server;
let resettingUrl = "";
let closedUrl = "";

beforeAll(async () => {
  resetting = createServer((req) => {
    req.resume();
    req.on("end", () => req.socket.destroy());
  });
  await new Promise<void>((r) => resetting.listen(0, "127.0.0.1", () => r()));
  resettingUrl = `http://127.0.0.1:${(resetting.address() as AddressInfo).port}`;
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", () => r()));
  closedUrl = `http://127.0.0.1:${(probe.address() as AddressInfo).port}`;
  await new Promise<void>((r) => probe.close(() => r()));
});

afterAll(() => resetting.close());

class ClosedLauncher extends FakeLauncher {
  isClosed(): boolean {
    return true;
  }
}

function channelAt(baseUrl: string, closed = false): ProxyChannel {
  const Launcher = closed ? ClosedLauncher : FakeLauncher;
  return new ProxyChannel({
    launcher: new Launcher({ baseUrl, token: "sbx" }),
    proxy: { forward },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: true,
  });
}

async function fireError(baseUrl: string, closed = false): Promise<unknown> {
  try {
    await channelAt(baseUrl, closed).fireTurn(ctx, "routine-c1", "run it");
  } catch (err) {
    return err;
  }
  throw new Error("the fire succeeded");
}

test("a refused dial reaches the caller raw and is redelivered", async () => {
  const err = await fireError(closedUrl);
  expect(isDialFailure(err)).toBe(true);
  expect(isRetryableFireError(err)).toBe(true);
});

test("a connection lost after the request is never redelivered", async () => {
  const err = await fireError(resettingUrl);
  expect(err).toBeInstanceOf(TurnDeliveryUncertainError);
  expect(isRetryableFireError(err)).toBe(false);
  expect((err as Error).message).toContain("the turn may have started");
});

test("a connection lost while the host drains is redelivered", async () => {
  const err = await fireError(resettingUrl, true);
  expect(err).toBeInstanceOf(TurnDeliveryUncertainError);
  expect((err as TurnDeliveryUncertainError).hostShuttingDown).toBe(true);
  expect(isRetryableFireError(err)).toBe(true);
});

test("only dial-time codes count as a dial failure", () => {
  const failed = (code: string) =>
    Object.assign(new TypeError("fetch failed"), { cause: { code } });
  expect(isDialFailure(failed("ECONNREFUSED"))).toBe(true);
  expect(isDialFailure(failed("UND_ERR_CONNECT_TIMEOUT"))).toBe(true);
  expect(isDialFailure(failed("ECONNRESET"))).toBe(false);
  expect(isDialFailure(failed("UND_ERR_SOCKET"))).toBe(false);
  expect(isDialFailure(new TypeError("fetch failed"))).toBe(false);
});

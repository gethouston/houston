import { createServer as createHttpServer } from "node:http";
import { type AddressInfo, connect, Socket } from "node:net";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { type FenceNet, type FenceProxy, startFenceProxy } from "./fence-proxy";
import type { FenceLookup } from "./fence-resolve";

const PUBLIC = "198.51.100.7";
const HANG = "198.51.100.9";
const http = createHttpServer((_req, res) => res.end("ok"));
let httpPort = 0;
const proxies: FenceProxy[] = [];
const sockets: Socket[] = [];

beforeAll(async () => {
  httpPort = await new Promise<number>((resolve) =>
    http.listen(0, "127.0.0.1", () =>
      resolve((http.address() as AddressInfo).port),
    ),
  );
});

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((p) => p.close()));
  for (const socket of sockets.splice(0)) socket.destroy();
});

afterAll(() => {
  http.close();
});

const answering =
  (address: string, delayMs = 0): FenceLookup =>
  (_host) =>
    new Promise((resolve) =>
      setTimeout(() => resolve([{ address, family: 4 }]), delayMs),
    );

async function proxy(net: FenceNet) {
  const started = await startFenceProxy("blocked", {
    connect: (address, port) => {
      if (address === HANG) {
        const socket = new Socket();
        sockets.push(socket);
        return socket;
      }
      return connect({ host: "127.0.0.1", port });
    },
    ...net,
  });
  proxies.push(started);
  return started.port;
}

function exchange(port: number, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port });
    let reply = "";
    socket.on("data", (chunk) => {
      reply += chunk.toString("latin1");
    });
    socket.on("close", () => resolve(reply));
    socket.on("error", reject);
    socket.write(request);
  });
}

test("the head timer stops once the head is in: a slow lookup still gets its page", async () => {
  const port = await proxy({ lookup: answering(PUBLIC, 150), headMs: 50 });
  const reply = await exchange(
    port,
    `GET http://site.test:${httpPort}/ HTTP/1.1\r\n\r\n`,
  );
  expect(reply).toMatch(/^HTTP\/1\.1 200 OK/);
});

test("judging plus connecting past the bound is the fence's 502", async () => {
  const port = await proxy({
    lookup: () => new Promise(() => undefined),
    connectBoundMs: 80,
  });
  const started = Date.now();
  const reply = await exchange(port, "CONNECT site.test:443 HTTP/1.1\r\n\r\n");
  expect(reply).toMatch(/^HTTP\/1\.1 502 /);
  expect(Date.now() - started).toBeLessThan(2_000);
  const dialing = await proxy({
    lookup: answering(HANG),
    attemptMs: 10_000,
    connectBoundMs: 80,
  });
  expect(
    await exchange(dialing, "CONNECT site.test:443 HTTP/1.1\r\n\r\n"),
  ).toMatch(/^HTTP\/1\.1 502 /);
  expect(sockets[0]?.destroyed).toBe(true);
});

test("the browser hanging up stops the lookup and the connect in progress", async () => {
  let lookupSignal: AbortSignal | undefined;
  const lookupPort = await proxy({
    lookup: (_host, signal) => {
      lookupSignal = signal;
      return new Promise(() => undefined);
    },
  });
  const first = connect({ host: "127.0.0.1", port: lookupPort });
  first.write("CONNECT site.test:443 HTTP/1.1\r\n\r\n");
  await vi.waitFor(() => expect(lookupSignal).toBeDefined());
  first.destroy();
  await vi.waitFor(() => expect(lookupSignal?.aborted).toBe(true));

  const dialPort = await proxy({ lookup: answering(HANG), attemptMs: 10_000 });
  const second = connect({ host: "127.0.0.1", port: dialPort });
  second.write("CONNECT site.test:443 HTTP/1.1\r\n\r\n");
  await vi.waitFor(() => expect(sockets).toHaveLength(1));
  second.destroy();
  await vi.waitFor(() => expect(sockets[0]?.destroyed).toBe(true));
});

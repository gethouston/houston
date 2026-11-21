import { createServer as createHttpServer } from "node:http";
import { type AddressInfo, connect, createServer, Socket } from "node:net";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { type FenceNet, type FenceProxy, startFenceProxy } from "./fence-proxy";
import { ownAddresses } from "./ip-ranges";

const PUBLIC = "198.51.100.7";
const DEAD = "198.51.100.8";
const HANG = "198.51.100.9";
let deadPort = 0;
const DNS: Record<string, string[]> = {
  "site.test": [PUBLIC],
  "fallback.test": [DEAD, HANG, PUBLIC],
  "loop.test": ["127.0.0.1"],
  "lan.test": ["10.0.0.7"],
  "mixed.test": [PUBLIC, "10.0.0.7"],
};

const seen: {
  method?: string;
  url?: string;
  body: string;
  headers: string[];
}[] = [];
const http = createHttpServer((req, res) => {
  let body = "";
  req.on("data", (c) => {
    body += c;
  });
  req.on("end", () => {
    seen.push({
      method: req.method,
      url: req.url,
      body,
      headers: req.rawHeaders,
    });
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`hello ${req.method} ${req.url}`);
  });
});
const echo = createServer((socket) => socket.pipe(socket));
let httpPort = 0;
let echoPort = 0;

const lookup = vi.fn(async (host: string) => {
  const answers = DNS[host];
  if (!answers) throw Object.assign(new Error("no"), { code: "ENOTFOUND" });
  return answers.map((address) => ({ address, family: 4 }));
});
const dialed: string[] = [];
const net: FenceNet = {
  lookup,
  connect: (address, port) => {
    dialed.push(`${address}:${port}`);
    if (address === HANG) return new Socket();
    if (address === DEAD) return connect({ host: "127.0.0.1", port: deadPort });
    return connect({ host: address === PUBLIC ? "127.0.0.1" : address, port });
  },
  attemptMs: 100,
};

const proxies: FenceProxy[] = [];
async function proxy(
  privateNetworks: "blocked" | "allowed" = "blocked",
  extra: FenceNet = {},
) {
  const started = await startFenceProxy(privateNetworks, { ...net, ...extra });
  proxies.push(started);
  return started;
}

beforeAll(async () => {
  const listen = (server: ReturnType<typeof createServer> | typeof http) =>
    new Promise<number>((resolve) =>
      server.listen(0, "127.0.0.1", () =>
        resolve((server.address() as AddressInfo).port),
      ),
    );
  httpPort = await listen(http);
  echoPort = await listen(echo);
  const closed = createServer();
  deadPort = await listen(closed);
  closed.close();
});

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((p) => p.close()));
  seen.length = 0;
  dialed.length = 0;
  lookup.mockClear();
});

afterAll(() => {
  http.close();
  echo.close();
});

function exchange(
  port: number,
  request: string,
  then?: (s: Socket, reply: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port });
    let reply = "";
    socket.on("data", (chunk) => {
      reply += chunk.toString("latin1");
      then?.(socket, reply);
    });
    socket.on("end", () => resolve(reply));
    socket.on("close", () => resolve(reply));
    socket.on("error", reject);
    socket.write(request);
  });
}

test("a plain-http request is forwarded in origin form to the address the proxy checked", async () => {
  const { port } = await proxy();
  const reply = await exchange(
    port,
    `POST http://site.test:${httpPort}/form?q=1 HTTP/1.1\r\nHost: site.test:${httpPort}\r\nProxy-Connection: keep-alive\r\nContent-Length: 5\r\n\r\nhello`,
  );
  expect(reply).toMatch(/^HTTP\/1\.1 200 OK/);
  expect(reply).toContain("hello POST /form?q=1");
  expect(seen[0]).toMatchObject({
    method: "POST",
    url: "/form?q=1",
    body: "hello",
  });
  expect(seen[0]?.headers.map((h) => h.toLowerCase())).not.toContain(
    "proxy-connection",
  );
  expect(dialed).toEqual([`${PUBLIC}:${httpPort}`]);
  expect(lookup).toHaveBeenCalledTimes(1);
});

test("a name that resolves to this machine is refused with the fence's 403 and never reached", async () => {
  const fence = await proxy();
  const reply = await exchange(
    fence.port,
    `GET http://loop.test:${httpPort}/secret HTTP/1.1\r\nHost: loop.test\r\n\r\n`,
  );
  expect(reply).toMatch(/^HTTP\/1\.1 403 Forbidden\r\n/);
  expect(reply).toContain("x-houston-fence: refused");
  expect(seen).toEqual([]);
  expect(dialed).toEqual([]);
  expect(fence.refused("loop.test")).toBe(true);
  expect(fence.refused("LOOP.test.")).toBe(true);
  expect(fence.refused("site.test")).toBe(false);
});

test("CONNECT opens a tunnel to an allowed name and carries bytes both ways", async () => {
  const { port } = await proxy();
  const reply = await exchange(
    port,
    `CONNECT site.test:${echoPort} HTTP/1.1\r\nHost: site.test:${echoPort}\r\n\r\nping`,
    (s, sofar) => {
      if (sofar.endsWith("ping")) s.end();
    },
  );
  expect(reply).toBe("HTTP/1.1 200 Connection Established\r\n\r\nping");
  expect(dialed).toEqual([`${PUBLIC}:${echoPort}`]);
});

test("CONNECT to a refused name, a private answer, or a mixed answer gets the 403", async () => {
  const { port } = await proxy();
  for (const authority of [
    "loop.test:443",
    "lan.test:443",
    "mixed.test:443",
    "metadata.google.internal.:80",
    "[::1]:443",
  ]) {
    const reply = await exchange(port, `CONNECT ${authority} HTTP/1.1\r\n\r\n`);
    expect(reply, authority).toMatch(/^HTTP\/1\.1 403 /);
  }
  expect(dialed).toEqual([]);
});

test("off the managed cloud a private answer is allowed through", async () => {
  const { port } = await proxy("allowed");
  const socket = connect({ host: "127.0.0.1", port });
  socket.on("error", () => undefined);
  socket.write("CONNECT lan.test:443 HTTP/1.1\r\n\r\n");
  await vi.waitFor(() => expect(dialed).toEqual(["10.0.0.7:443"]));
  socket.destroy();
});

test("a name with no answer, or a site that refuses the connection, is a 502", async () => {
  const { port } = await proxy();
  expect(
    await exchange(port, "GET http://nowhere.test/ HTTP/1.1\r\n\r\n"),
  ).toMatch(/^HTTP\/1\.1 502 /);
  const closed = createServer();
  const deadPort = await new Promise<number>((resolve) =>
    closed.listen(0, "127.0.0.1", () =>
      resolve((closed.address() as AddressInfo).port),
    ),
  );
  closed.close();
  expect(
    await exchange(port, `CONNECT site.test:${deadPort} HTTP/1.1\r\n\r\n`),
  ).toMatch(/^HTTP\/1\.1 502 /);
});

test("a malformed or origin-form request is a 400", async () => {
  const { port } = await proxy();
  expect(
    await exchange(port, "GET / HTTP/1.1\r\nHost: site.test\r\n\r\n"),
  ).toMatch(/^HTTP\/1\.1 400 /);
});

test("closing the proxy cuts its open tunnels", async () => {
  const fence = await proxy();
  const socket = connect({ host: "127.0.0.1", port: fence.port });
  const closed = new Promise<void>((resolve) =>
    socket.on("close", () => resolve()),
  );
  socket.on("error", () => undefined);
  socket.write(`CONNECT site.test:${echoPort} HTTP/1.1\r\n\r\n`);
  await new Promise<void>((resolve) => socket.once("data", () => resolve()));
  await fence.close();
  await closed;
  await fence.close();
});

test("a dead or silent first answer falls through to the next checked address", async () => {
  const { port } = await proxy();
  const reply = await exchange(
    port,
    `GET http://fallback.test:${httpPort}/x HTTP/1.1\r\nHost: fallback.test\r\n\r\n`,
  );
  expect(reply).toMatch(/^HTTP\/1\.1 200 OK/);
  expect(dialed).toEqual([
    `${DEAD}:${httpPort}`,
    `${HANG}:${httpPort}`,
    `${PUBLIC}:${httpPort}`,
  ]);
});

test("this machine's own address is refused even where private networks are allowed", async () => {
  const { port } = await proxy("allowed", {
    own: () => ownAddresses({ en0: [{ address: "10.0.0.7" }] }),
  });
  const reply = await exchange(port, "CONNECT lan.test:443 HTTP/1.1\r\n\r\n");
  expect(reply).toMatch(/^HTTP\/1\.1 403 /);
  expect(dialed).toEqual([]);
});

test("an address this machine gains after the proxy starts is refused too", async () => {
  let interfaces: Record<string, { address: string }[]> = {};
  const { port } = await proxy("allowed", {
    own: () => ownAddresses(interfaces),
  });
  interfaces = { en0: [{ address: "10.0.0.7" }] };
  const reply = await exchange(port, "CONNECT lan.test:443 HTTP/1.1\r\n\r\n");
  expect(reply).toMatch(/^HTTP\/1\.1 403 /);
  expect(dialed).toEqual([]);
});

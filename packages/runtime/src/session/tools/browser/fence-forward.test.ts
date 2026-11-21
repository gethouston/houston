import { createServer as createHttpServer } from "node:http";
import { type AddressInfo, connect, createServer, Socket } from "node:net";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { relayOne } from "./fence-forward";
import { type FenceNet, type FenceProxy, startFenceProxy } from "./fence-proxy";

const FIRST = "198.51.100.10";
const SECOND = "198.51.100.11";
const RAW = "198.51.100.12";
const DNS: Record<string, string> = {
  "one.test": FIRST,
  "two.test": SECOND,
  "raw.test": RAW,
};
const seen: { site: string; url?: string; cookie?: string }[] = [];

function site(name: string) {
  return createHttpServer({ keepAlive: true }, (req, res) => {
    req.resume();
    req.on("end", () => {
      seen.push({ site: name, url: req.url, cookie: req.headers.cookie });
      res.writeHead(200, { connection: "keep-alive", "content-length": "2" });
      res.end("ok");
    });
  });
}
const first = site("first");
const second = site("second");
const raw = createServer((socket) => {
  socket.once("data", () =>
    socket.end(
      "HTTP/1.1 100\r\n\r\nHTTP/1.1 200 OK\r\nConnection: keep-alive\r\nContent-Length: 2\r\n\r\nok",
    ),
  );
});
const ports: Record<string, number> = {};
const dialed: string[] = [];
const net: FenceNet = {
  lookup: async (host) => {
    const address = DNS[host];
    if (!address) throw Object.assign(new Error("no"), { code: "ENOTFOUND" });
    return [{ address, family: 4 }];
  },
  connect: (address) => {
    dialed.push(address);
    return connect({ host: "127.0.0.1", port: ports[address] ?? 1 });
  },
};
let fence: FenceProxy;

beforeAll(async () => {
  for (const [address, server] of [
    [FIRST, first],
    [SECOND, second],
    [RAW, raw],
  ] as const)
    ports[address] = await new Promise<number>((resolve) =>
      server.listen(0, "127.0.0.1", () =>
        resolve((server.address() as AddressInfo).port),
      ),
    );
  fence = await startFenceProxy("blocked", net);
});

afterEach(() => {
  seen.length = 0;
  dialed.length = 0;
});

afterAll(async () => {
  await fence.close();
  first.close();
  second.close();
  raw.close();
});

function session(parts: string[]): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: fence.port });
    let reply = "";
    let next = 0;
    const send = () => {
      const part = parts[next++];
      if (part !== undefined && !socket.destroyed) socket.write(part);
    };
    socket.on("data", (chunk) => {
      reply += chunk.toString("latin1");
      if (reply.endsWith("ok")) setTimeout(send, 20);
    });
    socket.on("error", () => undefined);
    socket.on("close", () => resolve(reply));
    send();
  });
}

const get = (url: string, ...headers: string[]) =>
  [
    `GET ${url} HTTP/1.1`,
    "Proxy-Connection: keep-alive",
    ...headers,
    "",
    "",
  ].join("\r\n");

test("a second request on a kept-alive proxy connection never reaches the first site", async () => {
  const reply = await session([
    get("http://one.test/a", "Host: one.test"),
    get("http://two.test/b", "Host: two.test", "Cookie: sid=secret"),
  ]);
  expect(reply).toMatch(/^HTTP\/1\.1 200 OK\r\n/);
  expect(reply).toMatch(/\r\nConnection: close\r\n/);
  expect(reply.toLowerCase()).not.toContain("keep-alive");
  expect(seen).toEqual([{ site: "first", url: "/a", cookie: undefined }]);
  expect(dialed).toEqual([FIRST]);
});

test("bytes pipelined after the declared body are never relayed", async () => {
  const smuggled = `POST http://one.test/form HTTP/1.1\r\nHost: one.test\r\nContent-Length: 2\r\n\r\nhi${get("http://one.test/again", "Cookie: sid=secret")}`;
  const reply = await session([smuggled]);
  expect(reply).toBe("");
  expect(seen.filter((s) => s.url === "/again")).toEqual([]);
});

test("a chunked request body is refused with 411, never relayed", async () => {
  const reply = await session([
    "POST http://one.test/up HTTP/1.1\r\nHost: one.test\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nhi\r\n0\r\n\r\n",
  ]);
  expect(reply).toMatch(/^HTTP\/1\.1 411 /);
  expect(dialed).toEqual([]);
});

test("conflicting Content-Lengths are a 400", async () => {
  const reply = await session([
    "POST http://one.test/up HTTP/1.1\r\nContent-Length: 2\r\nContent-Length: 3\r\n\r\nhi",
  ]);
  expect(reply).toMatch(/^HTTP\/1\.1 400 /);
});

test("an interim response with no reason phrase still gets its final head closed", async () => {
  const reply = await session([get("http://raw.test/", "Host: raw.test")]);
  expect(reply).toMatch(/^HTTP\/1\.1 100\r\nConnection: close\r\n\r\n/);
  expect(reply).toContain(
    "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
  );
  expect(reply.toLowerCase()).not.toContain("keep-alive");
});

test("a first body chunk the site cannot take yet keeps the browser paused until drain", () => {
  const client = new Socket();
  const upstream = new Socket();
  vi.spyOn(upstream, "write").mockReturnValue(false);
  relayOne(
    client,
    upstream,
    Buffer.from("POST / HTTP/1.1\r\n\r\n"),
    4,
    Buffer.from("body"),
  );
  expect(client.isPaused()).toBe(true);
  upstream.emit("drain");
  expect(client.isPaused()).toBe(false);
  client.destroy();
  upstream.destroy();
});

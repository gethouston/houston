import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { WireFrame } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import { TurnLog } from "./turn-log";

const frame = { type: "text", data: "hello", turnId: "turn-1" } as WireFrame;
const servers: Server[] = [];

function controlledFetch() {
  const requests: Array<{
    body: unknown;
    resolve: (response?: Response) => void;
  }> = [];
  const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
    let resolveResponse!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    requests.push({
      body: JSON.parse(String(init?.body)),
      resolve: (value = new Response(null, { status: 204 })) =>
        resolveResponse(value),
    });
    return response;
  });
  return { fetchImpl, requests };
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

test("the first frame is posted immediately with claim authority", async () => {
  const requests: Array<{
    body: unknown;
    headers: IncomingHttpHeaders;
    url: string;
  }> = [];
  const gateway = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      requests.push({
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        headers: req.headers,
        url: req.url ?? "",
      });
      res.writeHead(204);
      res.end();
    })().catch((error) => {
      res.writeHead(500);
      res.end(error instanceof Error ? error.message : String(error));
    });
  });
  const baseUrl = await listen(gateway);
  const log = new TurnLog({
    baseUrl,
    org: "acme",
    agent: "helper",
    conversationId: "routine/c1",
    hostToken: "host-token",
    claim: { token: "claim-token", bootId: "boot-1" },
    batchMs: 60_000,
  });

  const first = log.record(frame);
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  await log.flush();

  expect(first).toEqual({ ...frame, seq: 1 });
  expect(requests[0]?.url).toBe("/v1/pod/turnlog/acme/helper/routine%2Fc1");
  expect(requests[0]?.body).toEqual([{ seq: 1, frame: first }]);
  expect(requests[0]?.headers.authorization).toBe("Bearer host-token");
  expect(requests[0]?.headers["x-houston-claim-token"]).toBe("claim-token");
  expect(requests[0]?.headers["x-houston-claim-boot"]).toBe("boot-1");
});

test("frames recorded in flight form one ordered contiguous batch", async () => {
  const { fetchImpl, requests } = controlledFetch();
  const log = new TurnLog({
    baseUrl: "https://gateway.test",
    org: "acme",
    agent: "helper",
    conversationId: "c1",
    hostToken: "host-token",
    claim: { token: "claim-token", bootId: "boot-1" },
    fetchImpl,
    batchMs: 60_000,
  });

  const first = log.record(frame);
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  const second = log.record({ ...frame, data: "second" } as WireFrame);
  const third = log.record({ ...frame, data: "third" } as WireFrame);
  expect(requests).toHaveLength(1);

  requests[0]?.resolve();
  await vi.waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[0]?.body).toEqual([{ seq: 1, frame: first }]);
  expect(requests[1]?.body).toEqual([
    { seq: 2, frame: second },
    { seq: 3, frame: third },
  ]);
  requests[1]?.resolve();
  await log.flush();
});

test("a terminal frame fixes an immediate batch boundary", async () => {
  const { fetchImpl, requests } = controlledFetch();
  const log = new TurnLog({
    baseUrl: "https://gateway.test",
    org: "acme",
    agent: "helper",
    conversationId: "c1",
    hostToken: "host-token",
    claim: { token: "claim-token", bootId: "boot-1" },
    fetchImpl,
    batchMs: 60_000,
  });

  log.record(frame);
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  const queued = log.record({ ...frame, data: "queued" } as WireFrame);
  const terminal = log.record({
    type: "done",
    data: null,
    turnId: "turn-1",
  });
  const afterTerminal = log.record({ ...frame, data: "after" } as WireFrame);

  requests[0]?.resolve();
  await vi.waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]?.body).toEqual([
    { seq: 2, frame: queued },
    { seq: 3, frame: terminal },
  ]);
  requests[1]?.resolve();
  await vi.waitFor(() => expect(requests).toHaveLength(3));
  expect(requests[2]?.body).toEqual([{ seq: 4, frame: afterTerminal }]);
  requests[2]?.resolve();
  await log.flush();
});

test("a 404 disables only that turn's sender", async () => {
  const fetchImpl = vi.fn<typeof fetch>(
    async () => new Response("missing", { status: 404 }),
  );
  const options = {
    baseUrl: "https://gateway.test",
    org: "acme",
    agent: "helper",
    conversationId: "c1",
    hostToken: "host-token",
    claim: { token: "claim-token", bootId: "boot-1" },
    fetchImpl,
    batchSize: 1,
  };
  const first = new TurnLog(options);
  first.record(frame);
  await first.flush();
  first.record(frame);
  await first.flush();
  expect(fetchImpl).toHaveBeenCalledTimes(1);

  const nextTurn = new TurnLog(options);
  nextTurn.record(frame);
  await nextTurn.flush();
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test("seqStart continues the conversation's stream instead of restarting at 1", async () => {
  const log = new TurnLog({
    baseUrl: "http://127.0.0.1:1",
    org: "org-1",
    agent: "agent-1",
    conversationId: "c1",
    hostToken: "host-token",
    claim: { token: "7", bootId: "boot" },
    fetchImpl: async () => new Response(null, { status: 204 }),
    seqStart: 41,
  });
  expect(log.record(frame).seq).toBe(41);
  expect(log.record(frame).seq).toBe(42);
  await log.flush();
});

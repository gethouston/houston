import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { WireFrame } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import { TurnLog } from "./turn-log";

const user = { type: "user", data: { content: "hi", ts: 1 } } as WireFrame;
const failed = {
  type: "error",
  data: { message: "Invalid array length" },
} as WireFrame;
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

async function gateway(): Promise<{ baseUrl: string; seqs: number[] }> {
  const seqs: number[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      for (const entry of JSON.parse(body) as { seq: number }[])
        seqs.push(entry.seq);
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, seqs };
}

function turnLog(baseUrl: string, fetchImpl: typeof fetch) {
  return new TurnLog({
    baseUrl,
    org: "o",
    agent: "a",
    conversationId: "c",
    hostToken: "h",
    claim: { token: "t", bootId: "b" },
    seqStart: 577,
    retryDelaysMs: [10],
    fetchImpl,
  });
}

test("a batch in flight across an event-loop stall longer than its timeout lands once", async () => {
  const { baseUrl, seqs } = await gateway();
  const fetchImpl = vi.fn<typeof fetch>((input, init) => fetch(input, init));
  const log = turnLog(baseUrl, fetchImpl);

  log.record(user);
  await Promise.resolve();
  await Promise.resolve();
  const until = Date.now() + 5_400;
  while (Date.now() < until) {}
  log.record(failed);
  await log.flush();

  expect(seqs).toEqual([577, 578]);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
}, 20_000);

test("a failed request or a 503 is resent; a fenced claim is not", async () => {
  const answers: Array<number | Error> = [
    new TypeError("fetch failed"),
    503,
    200,
    409,
  ];
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    const answer = answers.shift() ?? 200;
    if (answer instanceof Error) throw answer;
    return new Response("{}", { status: answer });
  });
  const log = new TurnLog({
    baseUrl: "https://gateway.test",
    org: "o",
    agent: "a",
    conversationId: "c",
    hostToken: "h",
    claim: { token: "t", bootId: "b" },
    retryDelaysMs: [10, 10],
    fetchImpl,
  });

  log.record(user);
  await log.flush();
  expect(fetchImpl).toHaveBeenCalledTimes(3);

  log.record(failed);
  await log.flush();
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});

test("a refusal whose body never arrives is still final", async () => {
  const brokenBody = () =>
    new ReadableStream({
      start(controller) {
        controller.error(new Error("connection reset"));
      },
    });
  const fetchImpl = vi.fn<typeof fetch>(
    async () => new Response(brokenBody(), { status: 409 }),
  );
  const log = turnLog("https://gateway.test", fetchImpl);

  log.record(user);
  await log.flush();

  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

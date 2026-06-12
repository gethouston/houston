import { test, expect } from "bun:test";
import { createServer, type Server } from "node:http";
import { createAgent, deleteAgent, downloadFile, listFiles, runTurn, type CpClient } from "./client";

/**
 * The harness driver against a stub control plane: subscribe-then-send order,
 * SSE terminal-frame detection, timeout behavior, and binary download.
 */

function stubCp(): Promise<{ cp: CpClient; close: () => Promise<void>; log: string[] }> {
  const log: string[] = [];
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://x");
    log.push(`${req.method} ${url.pathname}`);

    if (req.method === "POST" && url.pathname === "/agents") {
      res.writeHead(201, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ id: "agent-1" }));
    }
    if (req.method === "DELETE" && url.pathname === "/agents/agent-1") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (url.pathname.endsWith("/events")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(": connected\n\n");
      res.write(`data: ${JSON.stringify({ type: "sync", data: {} })}\n\n`);
      // Terminal frame arrives only after the message has been posted.
      const finish = () => {
        res.write(`data: ${JSON.stringify({ type: "text", data: { delta: "working" } })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: "done", data: null })}\n\n`);
      };
      const poll = setInterval(() => {
        if (log.some((l) => l.includes("/messages"))) {
          clearInterval(poll);
          finish();
        }
      }, 10);
      req.on("close", () => clearInterval(poll));
      return;
    }
    if (url.pathname.endsWith("/messages") && req.method === "POST") {
      res.writeHead(202, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (url.pathname.endsWith("/files") && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify([{ path: "deck.pptx", name: "deck.pptx", size: 4, is_directory: false }]),
      );
    }
    if (url.pathname.endsWith("/files/download")) {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      return res.end(Buffer.from([0x50, 0x4b, 0xff, 0x00]));
    }
    res.writeHead(404);
    res.end("{}");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        cp: {
          baseUrl: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`,
          token: "tok",
        },
        close: () => new Promise<void>((r) => server.close(() => r())),
        log,
      });
    });
  });
}

test("runTurn subscribes before sending and resolves on the done frame", async () => {
  const { cp, close, log } = await stubCp();
  const agent = await createAgent(cp, "eval-deck");
  expect(agent.id).toBe("agent-1");

  const result = await runTurn(cp, agent.id, "c1", "build a deck", 10);
  expect(result.outcome).toBe("done");
  expect(result.events).toBeGreaterThanOrEqual(2); // sync + text + done

  // Subscribe-then-send: the events GET must hit before the messages POST.
  const evIdx = log.findIndex((l) => l.includes("/events"));
  const msgIdx = log.findIndex((l) => l.includes("/messages"));
  expect(evIdx).toBeGreaterThanOrEqual(0);
  expect(msgIdx).toBeGreaterThan(evIdx);

  const files = await listFiles(cp, agent.id);
  expect(files[0]!.path).toBe("deck.pptx");
  const bytes = await downloadFile(cp, agent.id, "deck.pptx");
  expect([...bytes]).toEqual([0x50, 0x4b, 0xff, 0x00]);

  await deleteAgent(cp, agent.id);
  await close();
});

test("runTurn times out when no terminal frame ever arrives", async () => {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    if (url.pathname.endsWith("/events")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(": connected\n\n"); // then silence forever
      return;
    }
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const cp: CpClient = {
    baseUrl: `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`,
    token: "tok",
  };
  await expect(runTurn(cp, "a", "c", "hi", 1)).rejects.toThrow(/timed out/);
  await new Promise<void>((r) => server.close(() => r()));
});

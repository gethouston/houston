import { mkdirSync, mkdtempSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { assistantApprovals } from "../assistant/approvals";
import type { RuntimeSpawner } from "../launcher/process";
import { buildLocalHost } from "../local/host";

/**
 * A4 / A5 END TO END — the user's own message is the only thing that turns a
 * host-issued request id into a receipt, and this is the seam it passes through.
 *
 * Driven through the REAL route (`routes/agents.ts` -> the channel -> the
 * runtime), because the whole property is about where in the request path the
 * receipt is written: a runtime cannot author a user message, so a receipt
 * written here is one a person actually clicked for. A fake runtime stands in
 * for the pi process and records exactly what reached it, which is how "the
 * marker never travels further than the host" is provable rather than asserted.
 */

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

/** A runtime that answers the readiness probe and records every turn body. */
function fakeRuntime() {
  const bodies: string[] = [];
  const server = createHttpServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200);
      res.end("ok");
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      bodies.push(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  const spawner: RuntimeSpawner = {
    spawn: () => ({
      port: (server.address() as { port: number }).port,
      kill: () => {},
    }),
  };
  return {
    bodies,
    spawner,
    listen: () =>
      new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r())),
    close: () => server.close(),
  };
}

async function withHost(
  run: (base: string, agentId: string) => Promise<void>,
): Promise<string[]> {
  const rt = fakeRuntime();
  await rt.listen();
  const houstonHome = mkdtempSync(join(tmpdir(), "houston-receipts-"));
  const workspacesRoot = join(houstonHome, "workspaces");
  mkdirSync(join(workspacesRoot, "Work", "Sales"), { recursive: true });
  const port = await freePort();
  const host = buildLocalHost({
    workspacesRoot,
    credentialsPath: join(houstonHome, "credentials.json"),
    port,
    token: "boot-secret",
    runtimeCommand: ["true"],
    spawner: rt.spawner,
  });
  await host.start();
  try {
    await run(`http://127.0.0.1:${port}`, "Work/Sales");
  } finally {
    host.stop();
    rt.close();
    assistantApprovals.clear();
  }
  return rt.bodies;
}

const auth = {
  Authorization: "Bearer boot-secret",
  "Content-Type": "application/json",
};

function issue(agentId: string, conversationId: string) {
  return assistantApprovals.issue({
    operation: "deleteRoutine",
    params: { id: "r1" },
    agentId,
    conversationId,
    summary: "Delete a routine for good.",
  });
}

const spend = (requestId: string, agentId: string, conversationId: string) =>
  assistantApprovals.consume({
    requestId,
    operation: "deleteRoutine",
    params: { id: "r1" },
    agentId,
    conversationId,
  });

test("the user's reply mints the receipt, and the receipts never reach the runtime", async () => {
  let outcome = "";
  let requestId = "";
  const bodies = await withHost(async (base, agentId) => {
    const request = issue(agentId, "c1");
    requestId = request.requestId;
    const res = await fetch(
      `${base}/agents/${encodeURIComponent(agentId)}/conversations/c1/messages`,
      {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          text: "Delete it?: Yes, go ahead",
          approvals: [{ requestId: request.requestId, decision: "approve" }],
        }),
      },
    );
    expect(res.status).toBe(202);
    outcome = spend(request.requestId, agentId, "c1");
  });

  expect(outcome).toBe("approved");
  expect(bodies).toHaveLength(1);
  expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({
    text: "Delete it?: Yes, go ahead",
  });
  expect(bodies[0]).not.toContain("approvals");
  expect(bodies[0]).not.toContain(requestId);
});

test("a reply that answers nothing retires the card and mints no receipt", async () => {
  let outcome = "";
  const bodies = await withHost(async (base, agentId) => {
    const request = issue(agentId, "c1");
    await fetch(
      `${base}/agents/${encodeURIComponent(agentId)}/conversations/c1/messages`,
      {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ text: "/clear" }),
      },
    );
    outcome = spend(request.requestId, agentId, "c1");
  });

  expect(outcome).toBe("none");
  expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({ text: "/clear" });
});

test("a reply in another conversation cannot answer this card", async () => {
  let outcome = "";
  await withHost(async (base, agentId) => {
    const request = issue(agentId, "c1");
    await fetch(
      `${base}/agents/${encodeURIComponent(agentId)}/conversations/c2/messages`,
      {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          text: "yes",
          approvals: [{ requestId: request.requestId, decision: "approve" }],
        }),
      },
    );
    outcome = spend(request.requestId, agentId, "c1");
  });
  expect(outcome).toBe("none");
});

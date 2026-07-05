import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import { expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { LocalPaths } from "../paths";
import { MemoryVfs } from "../vfs";
import { handleAgentFile } from "./agent-file";

/**
 * The raw `agentfile/**` read/write route the desktop board + agent-settings
 * panes ride. The load-bearing behavior under test is REACTIVITY: a write must
 * fire the event the SHARED domain classifier picks (not the drifted local copy
 * this route used to carry), so a CLAUDE.md PUT reaches every connected client's
 * Instructions pane as `ContextChanged`, not `FilesChanged` (HOU-644).
 */

const ws: Workspace = {
  id: "ws-1",
  ownerUserId: "alice",
  kind: "personal",
  name: "Personal",
  slug: "personal",
  runtime: "local",
  createdAt: 0,
};
const agent: Agent = {
  id: "Personal/Helper",
  workspaceId: "ws-1",
  name: "Helper",
  createdAt: 0,
};
const paths = new LocalPaths();

/** A fake IncomingMessage: an async byte stream carrying the JSON body. */
function fakeReq(body?: unknown): IncomingMessage {
  const buf = Buffer.from(body === undefined ? "" : JSON.stringify(body));
  return {
    async *[Symbol.asyncIterator]() {
      if (buf.byteLength) yield buf;
    },
  } as unknown as IncomingMessage;
}

/** A fake ServerResponse capturing the status + JSON body `json()` writes. */
function fakeRes() {
  const captured: { status: number; body: unknown } = { status: 0, body: null };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return res;
    },
    end(chunk?: Buffer) {
      captured.body = chunk ? JSON.parse(chunk.toString("utf8")) : null;
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

/** Drive the handler once; return the response + any events it emitted. */
async function call(method: string, rel: string, body?: unknown) {
  const vfs = shared.vfs;
  const events: HoustonEvent[] = [];
  const { res, captured } = fakeRes();
  const handled = await handleAgentFile(
    vfs,
    paths,
    { workspace: ws, agent },
    method,
    `agentfile/${rel}`,
    fakeReq(body),
    res,
    (e) => events.push(e),
  );
  return { handled, ...captured, events };
}

// One vfs shared across the file's tests (writes accumulate, as on a real host).
const shared = { vfs: new MemoryVfs() };

test("PUT CLAUDE.md emits ContextChanged (was mis-classified as FilesChanged)", async () => {
  const r = await call("PUT", "CLAUDE.md", { content: "# Be concise" });
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ ok: true });
  expect(r.events).toEqual([
    { type: "ContextChanged", agentPath: "Personal/Helper" },
  ]);
});

test("PUT a routines file emits RoutinesChanged", async () => {
  const r = await call("PUT", ".houston/routines/routines.json", {
    content: "[]",
  });
  expect(r.status).toBe(200);
  expect(r.events).toEqual([
    { type: "RoutinesChanged", agentPath: "Personal/Helper" },
  ]);
});

test("PUT a skills file emits SkillsChanged (previously silent)", async () => {
  const r = await call("PUT", ".agents/skills/summarize/SKILL.md", {
    content: "---\nname: summarize\n---\n",
  });
  expect(r.status).toBe(200);
  expect(r.events).toEqual([
    { type: "SkillsChanged", agentPath: "Personal/Helper" },
  ]);
});

test("PUT an ordinary working file emits FilesChanged", async () => {
  const r = await call("PUT", "notes/todo.txt", { content: "hi" });
  expect(r.status).toBe(200);
  expect(r.events).toEqual([
    { type: "FilesChanged", agentPath: "Personal/Helper" },
  ]);
});

test("PUT .DS_Store is written but emits no event (internal bookkeeping)", async () => {
  const r = await call("PUT", ".DS_Store", { content: "junk" });
  expect(r.status).toBe(200);
  expect(r.events).toEqual([]);
});

test("GET returns the previously written content", async () => {
  const r = await call("GET", "CLAUDE.md");
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ content: "# Be concise" });
});

test("GET a missing file returns empty content, not 404", async () => {
  const r = await call("GET", "never-written.txt");
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ content: "" });
});

test("a path escape (../) is rejected 400 and emits nothing", async () => {
  const r = await call("PUT", "../secret.txt", { content: "x" });
  expect(r.status).toBe(400);
  expect(r.body).toEqual({ error: "invalid path" });
  expect(r.events).toEqual([]);
});

test("PUT without a string content is rejected 400", async () => {
  const r = await call("PUT", "CLAUDE.md", { nope: true });
  expect(r.status).toBe(400);
  expect(r.body).toEqual({ error: "missing 'content'" });
  expect(r.events).toEqual([]);
});

test("no vfs wired → 503, handled but no write", async () => {
  const events: HoustonEvent[] = [];
  const { res, captured } = fakeRes();
  const handled = await handleAgentFile(
    undefined,
    paths,
    { workspace: ws, agent },
    "GET",
    "agentfile/CLAUDE.md",
    fakeReq(),
    res,
    (e) => events.push(e),
  );
  expect(handled).toBe(true);
  expect(captured.status).toBe(503);
});

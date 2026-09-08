import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import { expect, test } from "vitest";
import { assistantApprovals } from "../assistant/approvals";
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

test("PUT .DS_Store is refused: nothing under a dot name is a document", async () => {
  const r = await call("PUT", ".DS_Store", { content: "junk" });
  expect(r.status).toBe(403);
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

/**
 * S3 — WHAT THIS ROUTE MAY SERVE. On the local layout the runtime's data
 * directory sits INSIDE the agent root (`paths.ts`), so the traversal clamp
 * alone left the OAuth tokens, the served-providers manifest, `settings.json`
 * and every transcript one request away from anything holding a session: the
 * app's own Files rule (no top-level dot-directory) plus the named documents
 * the app actually keeps under one.
 */
const REFUSED_PATHS = [
  ".houston/runtime/auth.json",
  ".houston/runtime/served-providers.json",
  ".houston/runtime/settings.json",
  ".houston/runtime/conversations/conv-1.json",
  ".houston/runtime",
  ".git/config",
  ".env",
];

for (const rel of REFUSED_PATHS) {
  test(`GET ${rel} is refused, and reads nothing`, async () => {
    await shared.vfs.writeText(
      `${paths.agentRoot(ws, agent)}/${rel}`,
      "sk-ant-oat-SECRET",
    );
    const r = await call("GET", rel);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toContain("SECRET");
  });

  test(`PUT ${rel} is refused, and writes nothing`, async () => {
    const key = `${paths.agentRoot(ws, agent)}/${rel}`;
    const before = await shared.vfs.readText(key);
    const r = await call("PUT", rel, { content: "overwritten" });
    expect(r.status).toBe(403);
    expect(r.events).toEqual([]);
    expect(await shared.vfs.readText(key)).toBe(before);
  });
}

const SERVED_PATHS = [
  "CLAUDE.md",
  "WORKSPACE.md",
  "notes/todo.txt",
  ".houston/activity/activity.json",
  ".houston/config/config.json",
  ".houston/learnings/learnings.json",
  ".houston/routines/routines.json",
  ".agents/skills/summarize/SKILL.md",
];

for (const rel of SERVED_PATHS) {
  test(`${rel} is still the app's to read and write`, async () => {
    const written = await call("PUT", rel, { content: "[]" });
    expect(written.status).toBe(200);
    expect((await call("GET", rel)).status).toBe(200);
  });
}

/**
 * S10 — THE BOARD IS READ THROUGH HERE. `app/src/data/activity.ts` reads
 * `.houston/activity/activity.json` as a document, so an approval card stored
 * on a mission row reaches the person through THIS route: it has to be
 * re-rendered from the host's record, exactly as the typed activities route
 * does, or the card says whatever the agent's file tools wrote next to a live
 * receipt.
 */
test("an approval card on the board is served from the HOST's record", async () => {
  assistantApprovals.clear();
  const request = assistantApprovals.issue({
    operation: "delete_agent",
    params: { agent: "Dobby" },
    agentId: agent.id,
    conversationId: "c1",
    summary: "Delete Dobby and everything it has done?",
    detail: "Personal/Dobby",
  });
  const board = [
    {
      id: "m1",
      title: "Tidy the deck",
      status: "needs_you",
      pending_interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Rename the deck to Q4?",
            options: [
              { kind: "approval", id: "approve" },
              { kind: "approval", id: "decline" },
            ],
            requestId: request.requestId,
          },
        ],
      },
    },
  ];
  await call("PUT", ".houston/activity/activity.json", {
    content: JSON.stringify(board),
  });
  const r = await call("GET", ".houston/activity/activity.json");
  const served = JSON.parse((r.body as { content: string }).content) as {
    pending_interaction: { steps: Record<string, unknown>[] };
  }[];
  const step = served[0]?.pending_interaction.steps[0];
  expect(step?.question).toBe("Delete Dobby and everything it has done?");
  expect(step?.requestId).toBe(request.requestId);
  assistantApprovals.clear();
});

test("a requestId with no live record is stripped from the board", async () => {
  assistantApprovals.clear();
  const board = [
    {
      id: "m1",
      title: "Tidy the deck",
      status: "needs_you",
      pending_interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Rename the deck to Q4?",
            options: [{ kind: "approval", id: "approve" }],
            requestId: "f".repeat(32),
          },
        ],
      },
    },
  ];
  await call("PUT", ".houston/activity/activity.json", {
    content: JSON.stringify(board),
  });
  const r = await call("GET", ".houston/activity/activity.json");
  const served = JSON.parse((r.body as { content: string }).content) as {
    pending_interaction: { steps: Record<string, unknown>[] };
  }[];
  expect(served[0]?.pending_interaction.steps[0]?.requestId).toBeUndefined();
});

test("a document that is not JSON is served byte for byte", async () => {
  await call("PUT", "CLAUDE.md", { content: "# Be concise\n" });
  const r = await call("GET", "CLAUDE.md");
  expect(r.body).toEqual({ content: "# Be concise\n" });
});

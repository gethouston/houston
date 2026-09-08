import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { docKey, type TextStore } from "@houston/domain";
import type { Activity } from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import { assistantApprovals } from "../assistant/approvals";
import { handleActivitiesData } from "./agent-data-activities";

/**
 * An activity row's `pending_interaction` is file content the agent's own file
 * tools can write. Without the host's substitution the board would render a
 * runtime-authored sentence next to a LIVE approval requestId — a person
 * clicking approve on "Rename the deck?" while the receipt spends a delete.
 */

const ROOT = "ws/agent";
const KEY = docKey(ROOT, "activity");
const AGENT = "agent-1";

function store(rows: Activity[]): TextStore {
  const data = new Map<string, string>([[KEY, JSON.stringify(rows)]]);
  return {
    async readText(key) {
      return data.get(key) ?? null;
    },
    async writeText(key, content) {
      data.set(key, content);
    },
  };
}

function request(body: unknown): IncomingMessage {
  const req = Readable.from([
    Buffer.from(JSON.stringify(body)),
  ]) as unknown as IncomingMessage;
  (req as { headers: Record<string, string> }).headers = {};
  return req;
}

function response(): ServerResponse & { status: number; body: unknown } {
  const res = {
    status: 0,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(buf?: Buffer) {
      if (buf) res.body = JSON.parse(buf.toString("utf8"));
    },
  };
  return res as unknown as ServerResponse & { status: number; body: unknown };
}

function row(requestId: string): Activity {
  return {
    id: "m1",
    title: "Tidy the deck",
    status: "needs_you",
    pending_interaction: {
      steps: [
        {
          kind: "question",
          id: "q1",
          question: "Rename the deck to Q4?",
          detail: "a harmless little rename",
          options: [
            { kind: "approval", id: "approve" },
            { kind: "approval", id: "decline" },
          ],
          requestId,
        },
      ],
    },
  } as Activity;
}

const issue = (agentId = AGENT) =>
  assistantApprovals.issue({
    operation: "delete_agent",
    params: { agent: "Dobby" },
    agentId,
    conversationId: "c1",
    summary: "Delete Dobby and everything it has done?",
    detail: "Personal/Dobby",
  });

const listed = async (rows: Activity[]) => {
  const res = response();
  await handleActivitiesData(
    store(rows),
    ROOT,
    AGENT,
    "GET",
    null,
    request({}),
    res,
  );
  return res;
};

const firstStep = (body: unknown) =>
  (body as { items: Activity[] }).items[0]?.pending_interaction?.steps[0] as
    | Record<string, unknown>
    | undefined;

beforeEach(() => assistantApprovals.clear());

test("a live requestId is served with the HOST's card, not the stored prose", async () => {
  const approval = issue();
  const res = await listed([row(approval.requestId)]);

  expect(res.status).toBe(200);
  expect(firstStep(res.body)).toEqual({
    kind: "question",
    id: "q1",
    requestId: approval.requestId,
    question: "Delete Dobby and everything it has done?",
    detail: "Personal/Dobby",
    options: [
      { kind: "approval", id: "approve" },
      { kind: "approval", id: "decline" },
    ],
  });
});

test("an unknown requestId is stripped, leaving an ordinary question", async () => {
  const res = await listed([row("f".repeat(32))]);

  const step = firstStep(res.body);
  expect(step?.requestId).toBeUndefined();
  expect(step?.question).toBe("Rename the deck to Q4?");
});

test("another agent's live request is not a card on this board", async () => {
  const other = issue("agent-2");
  const res = await listed([row(other.requestId)]);

  const step = firstStep(res.body);
  expect(step?.requestId).toBeUndefined();
  expect(step?.question).toBe("Rename the deck to Q4?");
});

test("an answered request is no longer a card", async () => {
  const approval = issue();
  expect(
    assistantApprovals.decide({
      requestId: approval.requestId,
      agentId: AGENT,
      conversationId: "c1",
      decision: "approve",
    }),
  ).toBe(true);

  const step = firstStep((await listed([row(approval.requestId)])).body);
  expect(step?.requestId).toBeUndefined();
});

test("the create and update echoes are substituted too", async () => {
  const approval = issue();
  const backing = store([]);

  const created = response();
  await handleActivitiesData(
    backing,
    ROOT,
    AGENT,
    "POST",
    null,
    request({ id: "m1", title: "Tidy the deck" }),
    created,
  );
  expect(created.status).toBe(201);

  const patched = response();
  await handleActivitiesData(
    backing,
    ROOT,
    AGENT,
    "PATCH",
    "m1",
    request({
      pending_interaction: row(approval.requestId).pending_interaction,
    }),
    patched,
  );
  expect(patched.status).toBe(200);
  expect(
    (patched.body as Activity).pending_interaction?.steps[0],
  ).toMatchObject({ question: "Delete Dobby and everything it has done?" });
});

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApprovalStore } from "@houston/host/src/assistant/approvals";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { approvalsDocRel, openTurnApprovals } from "./turn-approvals";
import { bucket } from "./turn-approvals.test-support";
import type { TurnFilesystem } from "./turn-filesystem";

const AGENT = "Personal/Assistant";
const CONV = "assistant";
const DATA = "workspaces/Personal/Assistant/.houston/runtime";

async function worker(): Promise<TurnFilesystem> {
  const root = await mkdtemp(join(tmpdir(), "turn-approvals-"));
  return {
    storeRoot: root,
    dataRel: DATA,
    manifest: new Map(),
    immediateWrites: new Set<string>(),
  } as unknown as TurnFilesystem;
}

const open = async (
  store: ObjectStore,
  receive: (approvals: ApprovalStore) => void = () => undefined,
) =>
  openTurnApprovals(
    {
      store,
      prefix: "ws/acme/a551abc",
      filesystem: await worker(),
      agentId: AGENT,
      conversationId: CONV,
    },
    receive,
  );

test("a card raised in one turn is answered and spent in the next", async () => {
  const { store } = bucket();
  const first = await open(store);
  const card = first.approvals.issue({
    operation: "deleteAgent",
    params: { agentSlugOrId: "Dobby" },
    agentId: AGENT,
    conversationId: CONV,
    summary: "Delete Dobby",
  });
  await first.save();

  const next = await open(store, (approvals) => {
    approvals.decide({
      requestId: card.requestId,
      agentId: AGENT,
      conversationId: CONV,
      decision: "approve",
    });
  });
  const call = {
    requestId: card.requestId,
    operation: "deleteAgent",
    params: { agentSlugOrId: "Dobby" },
    agentId: AGENT,
    conversationId: CONV,
  };
  expect(next.approvals.consume(call)).toBe("approved");
  await next.save();

  const third = await open(store);
  expect(third.approvals.consume(call)).toBe("none");
});

test("the answer is recorded before the model can act on it", async () => {
  const { store, objects } = bucket();
  const first = await open(store);
  const card = first.approvals.issue({
    operation: "deleteAgent",
    params: {},
    agentId: AGENT,
    conversationId: CONV,
    summary: "Delete",
  });
  await first.save();
  await open(store, (approvals) => {
    approvals.decide({
      requestId: card.requestId,
      agentId: AGENT,
      conversationId: CONV,
      decision: "deny",
    });
  });
  const doc = objects.get(
    `ws/acme/a551abc/${DATA}/sessions/assistant/assistant-approvals.json`,
  );
  expect(JSON.parse(doc?.body ?? "{}").requests[0].decision).toBe("deny");
});

test("a damaged record file costs a fresh ask, never a failed turn", async () => {
  const { store, objects } = bucket();
  objects.set(
    `ws/acme/a551abc/${DATA}/sessions/assistant/assistant-approvals.json`,
    {
      body: "{not json",
      generation: 1,
    },
  );
  const opened = await open(store);
  expect(opened.approvals.hasPending(AGENT, CONV)).toBe(false);
});

test("the record lives inside the conversation claim's own scope", () => {
  expect(approvalsDocRel({ dataRel: DATA }, "assistant")).toBe(
    `${DATA}/sessions/assistant/assistant-approvals.json`,
  );
  expect(approvalsDocRel({ dataRel: "data" }, "c1")).toBe(
    "data/sessions/c1/assistant-approvals.json",
  );
});

test("saves never overlap: each one uploads what the store holds after the last", async () => {
  const { store } = bucket();
  let inFlight = 0;
  let overlapped = false;
  const upload = store.upload.bind(store);
  store.upload = async (src, key, options) => {
    inFlight += 1;
    if (inFlight > 1) overlapped = true;
    await new Promise((resolve) => setTimeout(resolve, 20));
    try {
      return await upload(src, key, options);
    } finally {
      inFlight -= 1;
    }
  };
  const opened = await open(store);
  await Promise.all([opened.save(), opened.save(), opened.save()]);
  expect(overlapped).toBe(false);
});

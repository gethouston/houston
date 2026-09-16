import { messageAdmissionFileName } from "@houston/protocol/message-admission-file";
import { expect, test, vi } from "vitest";
import { ApprovalStore } from "../assistant/approvals";
import { MemoryVfs } from "../vfs";
import { guardTurnMessage } from "./turn-message-guard";

const agentId = "Personal/.assistant";
const conversationId = "assistant";
const dataRoot = "Personal/Assistant/.houston/runtime";

const guard = (
  body: Record<string, unknown>,
  options: { vfs?: MemoryVfs | undefined; approvals?: ApprovalStore } = {},
) =>
  guardTurnMessage({
    approvals: options.approvals ?? new ApprovalStore(),
    vfs: "vfs" in options ? options.vfs : new MemoryVfs(),
    dataRoot,
    agentId,
    conversationId,
    actor: "user-a",
    body: Buffer.from(JSON.stringify(body)),
  });

test("the request body is parsed once, however many readers look at it", async () => {
  const body = { text: "hello", nonce: "n" };
  const serialized = JSON.stringify(body);
  const parse = vi.spyOn(JSON, "parse");
  let reads = 0;
  try {
    await guard(body);
    reads = parse.mock.calls.filter(([value]) => value === serialized).length;
  } finally {
    parse.mockRestore();
  }
  expect(reads).toBe(1);
});

test("an admitted message is stripped of host-owned fields and carries its release", async () => {
  const approvals = new ApprovalStore();
  const request = approvals.issue({
    agentId,
    conversationId,
    operation: "deleteAgent",
    params: { id: "target" },
    summary: "Delete target",
  });
  const result = await guard(
    {
      text: "yes",
      nonce: "n",
      approvals: [{ requestId: request.requestId, decision: "approve" }],
    },
    { approvals },
  );
  if (result.kind !== "admitted") throw new Error(result.code);
  expect(result.duplicate).toBe(false);
  expect(result.body.toString()).not.toContain("approvals");
  expect(typeof result.release).toBe("function");
  expect(
    approvals.consume({
      agentId,
      conversationId,
      requestId: request.requestId,
      operation: "deleteAgent",
      params: { id: "target" },
    }),
  ).toBe("approved");
});

test("a message already accepted by the runtime is admitted as a duplicate", async () => {
  const approvals = new ApprovalStore();
  const body = { text: "hello", nonce: "n" };
  const first = await guard(body, { approvals });
  const replay = await guard(body, { approvals });
  expect(first.kind === "admitted" && first.duplicate).toBe(false);
  expect(replay.kind === "admitted" && replay.duplicate).toBe(true);
});

test.each([
  ["an unusable nonce", { text: "hello", nonce: "" }, 400, "invalid_nonce"],
  [
    "a nonce reused for different words",
    { text: "different", nonce: "n" },
    409,
    "nonce_conflict",
  ],
])("%s is refused with its own status", async (_case, body, status, code) => {
  const approvals = new ApprovalStore();
  await guard({ text: "hello", nonce: "n" }, { approvals });
  const result = await guard(body, { approvals });
  expect(result).toEqual({ kind: "refused", status, code });
});

test("a host that cannot read the durable receipts refuses rather than guesses", async () => {
  expect(
    await guard({ text: "hello", nonce: "n" }, { vfs: undefined }),
  ).toEqual({
    kind: "refused",
    status: 503,
    code: "approval_guard_unavailable",
  });
});

test("a corrupt durable receipt is a failure, never a refusal the client can retry", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(
    `${dataRoot}/${messageAdmissionFileName(conversationId, "n")}`,
    JSON.stringify({ version: 1, fingerprint: "nonsense" }),
  );
  await expect(guard({ text: "hello", nonce: "n" }, { vfs })).rejects.toThrow(
    "Invalid message admission receipt",
  );
});

test("a body that is not this route's JSON reaches the runtime untouched", async () => {
  const body = Buffer.from("not json at all");
  const result = await guardTurnMessage({
    approvals: new ApprovalStore(),
    vfs: new MemoryVfs(),
    dataRoot,
    agentId,
    conversationId,
    actor: "user-a",
    body,
  });
  expect(result).toEqual({ kind: "admitted", body, duplicate: false });
});

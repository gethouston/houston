import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, expect, test } from "vitest";
import {
  type ApprovalRecord,
  FileActionApprovalStore,
} from "./action-approval-store";

/**
 * The file-backed action-approval store: round-trip, atomic-write validity,
 * corrupt/missing-file resilience, and agent-id validation — persisting the
 * {always, tickets} record.
 */

const roots: string[] = [];
function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "action-approvals-"));
  roots.push(root);
  return root;
}
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const AGENT = "Personal/Assistant";
const fileFor = (root: string) =>
  join(root, "Personal", "Assistant", ".houston", "action-approvals.json");

test("round-trips the record through disk", async () => {
  const root = tmpRoot();
  const store = new FileActionApprovalStore(root);
  const record: ApprovalRecord = {
    always: ["GMAIL_SEND"],
    tickets: [{ hash: "0123456789abcdef", ts: 1000 }],
  };
  await store.put(AGENT, record);
  expect(await store.get(AGENT)).toEqual(record);
});

test("a missing file reads as the empty record", async () => {
  const store = new FileActionApprovalStore(tmpRoot());
  expect(await store.get(AGENT)).toEqual({ always: [], tickets: [] });
});

test("the on-disk file is valid, pretty JSON (atomic tmp+rename left no debris)", async () => {
  const root = tmpRoot();
  const store = new FileActionApprovalStore(root);
  await store.put(AGENT, { always: ["A"], tickets: [] });
  const raw = readFileSync(fileFor(root), "utf8");
  expect(() => JSON.parse(raw)).not.toThrow();
  expect(raw).toContain("\n"); // pretty-printed
  expect(() => readFileSync(`${fileFor(root)}.tmp`, "utf8")).toThrow(); // no leftover tmp
});

test("a corrupt file reads as the empty record (never crashes)", async () => {
  const root = tmpRoot();
  const path = fileFor(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "{ not json");
  const store = new FileActionApprovalStore(root);
  expect(await store.get(AGENT)).toEqual({ always: [], tickets: [] });
});

test("a structurally-wrong file drops the bad fields to empty", async () => {
  const root = tmpRoot();
  const path = fileFor(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ always: "nope", tickets: [{ ts: 1 }] }));
  const store = new FileActionApprovalStore(root);
  expect(await store.get(AGENT)).toEqual({ always: [], tickets: [] });
});

test("an invalid agent id reads empty and refuses to write", async () => {
  const store = new FileActionApprovalStore(tmpRoot());
  for (const bad of ["nowsplit", "../escape/x", "a/b/c"]) {
    expect(await store.get(bad)).toEqual({ always: [], tickets: [] });
    await expect(store.put(bad, { always: [], tickets: [] })).rejects.toThrow(
      /invalid agent id/,
    );
  }
});

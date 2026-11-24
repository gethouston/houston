import { expect, test } from "vitest";
import { partialSyncReply } from "./op-durability";

const synced = (deletesKept: { key: string; reason: string }[]) => ({
  uploaded: [],
  deleted: [],
  skipped: [],
  conflicts: [],
  merges: [],
  outOfScope: 0,
  outOfScopeKeys: [],
  conflictCopies: [],
  deletesKept,
  manifest: new Map(),
  totalBytes: 0,
});

test("an op whose delete was kept is not answered as done", () => {
  expect(
    partialSyncReply(synced([{ key: "a.md", reason: "412" }]), "delete"),
  ).toEqual({ ok: true, decline: true });
});

test("an op whose writes all landed answers its own reply", () => {
  expect(partialSyncReply(synced([]), "delete")).toBeNull();
});

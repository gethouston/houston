import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { messageAdmissionFileName } from "@houston/protocol/message-admission-file";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
  deleteConversationAt,
  getHistoryAt,
} from "./conversation-file";
import {
  MESSAGE_ADMISSION_PRUNE_INTERVAL_MS,
  MESSAGE_ADMISSION_RETENTION_MS,
  MESSAGE_ADMISSION_TEMPORARY_MS,
  MessageAdmissions,
  messageFingerprint,
} from "./message-admissions";

let directory: string;
let dataRoot: string;
let receiptsDirectory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "message-admissions-"));
  dataRoot = join(directory, "receipts");
  receiptsDirectory = join(dataRoot, "message-admissions");
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
const fingerprint = messageFingerprint(["hello"]);
const receipts = (now?: () => number) =>
  new MessageAdmissions(
    dataRoot,
    (id, turnId) =>
      getHistoryAt(directory, id)?.messages.some(
        (m) => m.role === "assistant" && m.turnId === turnId,
      ) ?? false,
    now,
  );
/** Backdate a file, the age prune reads, without waiting for the window. */
const backdate = (file: string, ms: number) => {
  const when = (statSync(file).mtimeMs - ms) / 1000;
  utimesSync(file, when, when);
};
const age = (conversationId: string, nonce: string, ms: number) =>
  backdate(join(dataRoot, messageAdmissionFileName(conversationId, nonce)), ms);
/** What a process killed mid-write leaves behind. */
const abandonTemporary = (ms: number) => {
  const file = join(receiptsDirectory, `abandoned.json.${randomUUID()}.tmp`);
  writeFileSync(file, "{}");
  backdate(file, ms);
  return file;
};

test("a lost acceptance response can be retried while the original executes", () => {
  const store = receipts();
  const first = store.accept("assistant", "nonce", fingerprint);
  expect(first.kind).toBe("new");
  expect(store.accept("assistant", "nonce", fingerprint)).toEqual({
    kind: "duplicate",
    turnId: first.turnId,
  });
  expect(readdirSync(receiptsDirectory)).toHaveLength(1);
});

test("process restart adopts completed canonical history without executing again", () => {
  const first = receipts().accept("assistant", "nonce", fingerprint);
  appendUserMessageAt(directory, "assistant", "hello", {
    turnId: first.turnId,
    nonce: "nonce",
  });
  appendAssistantMessageAt(directory, "assistant", "finished", {
    turnId: first.turnId,
  });
  expect(receipts().accept("assistant", "nonce", fingerprint)).toEqual({
    kind: "duplicate",
    turnId: first.turnId,
  });
  expect(getHistoryAt(directory, "assistant")?.messages[0]?.nonce).toBe(
    "nonce",
  );
});

test.each([
  false,
  true,
])("process restart never replays uncertain work (user persisted: %s)", (persistUser) => {
  const first = receipts().accept("assistant", "nonce", fingerprint);
  if (persistUser)
    appendUserMessageAt(directory, "assistant", "hello", {
      turnId: first.turnId,
      nonce: "nonce",
    });
  expect(receipts().accept("assistant", "nonce", fingerprint)).toEqual({
    kind: "interrupted",
    turnId: first.turnId,
  });
});

test("a nonce cannot be reused for a changed request, including after restart", () => {
  const first = receipts().accept("assistant", "nonce", fingerprint);
  expect(
    receipts().accept("assistant", "nonce", messageFingerprint(["delete"])),
  ).toEqual({ kind: "conflict", turnId: first.turnId });
});

test("conversation deletion never makes an accepted nonce executable again", () => {
  const first = receipts().accept("assistant", "nonce", fingerprint);
  appendUserMessageAt(directory, "assistant", "hello", {
    turnId: first.turnId,
  });
  deleteConversationAt(directory, "assistant");
  expect(receipts().accept("assistant", "nonce", fingerprint).kind).toBe(
    "interrupted",
  );
});

test("an unreadable receipt fails closed instead of accepting a replacement", () => {
  receipts().accept("assistant", "nonce", fingerprint);
  const file = readdirSync(receiptsDirectory)[0];
  if (!file) throw new Error("receipt missing");
  writeFileSync(join(receiptsDirectory, file), "{");
  expect(() => receipts().accept("assistant", "nonce", fingerprint)).toThrow();
});

test("identical nonces in separate conversations have independent identities", () => {
  const store = receipts();
  expect(store.accept("first", "nonce", fingerprint).turnId).not.toBe(
    store.accept("second", "nonce", fingerprint).turnId,
  );
});

test("a settled receipt still blocks re-execution until the retention window passes", () => {
  const store = receipts();
  const first = store.accept("assistant", "nonce", fingerprint);
  appendUserMessageAt(directory, "assistant", "hello", {
    turnId: first.turnId,
    nonce: "nonce",
  });
  appendAssistantMessageAt(directory, "assistant", "finished", {
    turnId: first.turnId,
  });
  store.settle("assistant", "nonce");
  // Settling ends the turn, never the promise the receipt makes: a retry that
  // arrives after the answer was written must still read as a duplicate.
  expect(store.accept("assistant", "nonce", fingerprint)).toEqual({
    kind: "duplicate",
    turnId: first.turnId,
  });
  expect(readdirSync(receiptsDirectory)).toHaveLength(1);
});

test("settling prunes receipts past the retention window and keeps the rest", async () => {
  const clock = { at: Date.now() };
  const store = receipts(() => clock.at);
  store.accept("assistant", "expired", fingerprint);
  store.settle("assistant", "expired");
  const live = store.accept("assistant", "live", fingerprint);
  store.accept("assistant", "recent", fingerprint);
  store.settle("assistant", "recent");
  age("assistant", "expired", MESSAGE_ADMISSION_RETENTION_MS + 60_000);
  age("assistant", "live", MESSAGE_ADMISSION_RETENTION_MS + 60_000);
  clock.at += MESSAGE_ADMISSION_PRUNE_INTERVAL_MS;
  store.settle("assistant", "recent");
  await store.collected();
  expect(readdirSync(receiptsDirectory)).toHaveLength(2);
  expect(store.accept("assistant", "expired", fingerprint).kind).toBe("new");
  // An in-flight turn's receipt is never collected, however old the file is:
  // deleting it would admit a concurrent retry as brand-new work.
  expect(store.accept("assistant", "live", fingerprint)).toEqual({
    kind: "duplicate",
    turnId: live.turnId,
  });
});

test("startup collects the receipts earlier runs left behind", async () => {
  const store = receipts();
  store.accept("assistant", "expired", fingerprint);
  store.accept("assistant", "recent", fingerprint);
  age("assistant", "expired", MESSAGE_ADMISSION_RETENTION_MS + 60_000);
  await receipts().collected();
  expect(readdirSync(receiptsDirectory)).toEqual([
    messageAdmissionFileName("assistant", "recent").split("/")[1],
  ]);
});

test("acceptance durably carries the host's original semantic fingerprint", () => {
  const hostFingerprint = messageFingerprint(["host-owned intent"]);
  const accepted = receipts().accept(
    "assistant",
    "nonce",
    fingerprint,
    hostFingerprint,
  );
  const file = readdirSync(receiptsDirectory)[0];
  if (!file) throw new Error("receipt missing");
  expect(
    JSON.parse(readFileSync(join(receiptsDirectory, file), "utf8")),
  ).toEqual({
    version: 1,
    fingerprint,
    hostFingerprint,
    turnId: accepted.turnId,
  });
});

test("an abandoned temporary is collected within the hour, never held for a week", async () => {
  const store = receipts();
  store.accept("assistant", "live", fingerprint);
  const stale = abandonTemporary(MESSAGE_ADMISSION_TEMPORARY_MS + 60_000);
  const fresh = abandonTemporary(0);
  await receipts().collected();
  const left = readdirSync(receiptsDirectory);
  expect(left).not.toContain(basename(stale));
  expect(left).toContain(basename(fresh));
});

test("collection never runs on the turn that settled", async () => {
  const clock = { at: Date.now() };
  const store = receipts(() => clock.at);
  store.accept("assistant", "expired", fingerprint);
  store.settle("assistant", "expired");
  store.accept("assistant", "recent", fingerprint);
  store.settle("assistant", "recent");
  age("assistant", "expired", MESSAGE_ADMISSION_RETENTION_MS + 60_000);
  clock.at += MESSAGE_ADMISSION_PRUNE_INTERVAL_MS;
  store.settle("assistant", "recent");
  // Settling returned before the directory was even read: housekeeping is not
  // the settling turn's work.
  expect(readdirSync(receiptsDirectory)).toHaveLength(2);
  await store.collected();
  expect(readdirSync(receiptsDirectory)).toHaveLength(1);
});

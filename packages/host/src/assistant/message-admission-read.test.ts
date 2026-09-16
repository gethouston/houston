import { messageAdmissionFileName } from "@houston/protocol/message-admission-file";
import { expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { readMessageAdmission } from "./message-admission-read";

const root = "Personal/Assistant/.houston/runtime";
const body = { text: "hello", nonce: "n" };
// The runtime writer's own path helper: a drift between the two sides would
// make every retry read as new work, so the test addresses what it addresses.
const key = `${root}/${messageAdmissionFileName("assistant", "n")}`;

test("missing durable receipt is distinct from an unavailable or corrupt read", async () => {
  const vfs = new MemoryVfs();
  expect(await readMessageAdmission(vfs, root, "assistant", body)).toBeNull();
  await expect(
    readMessageAdmission(undefined, root, "assistant", body),
  ).rejects.toThrow("approval_guard_unavailable");
  await vfs.writeText(key, "{");
  await expect(
    readMessageAdmission(vfs, root, "assistant", body),
  ).rejects.toThrow();
  await vfs.writeText(
    key,
    JSON.stringify({ version: 1, fingerprint: "invalid", turnId: "turn" }),
  );
  await expect(
    readMessageAdmission(vfs, root, "assistant", body),
  ).rejects.toThrow("Invalid message admission receipt");
});

test("host reads the shared runtime receipt through the configured data layout", async () => {
  const vfs = new MemoryVfs();
  const receipt = {
    version: 1,
    fingerprint: "a".repeat(64),
    turnId: "turn",
    hostFingerprint: "b".repeat(64),
  };
  await vfs.writeText(key, JSON.stringify(receipt));
  expect(await readMessageAdmission(vfs, root, "assistant", body)).toEqual(
    receipt,
  );
});

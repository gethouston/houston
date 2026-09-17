import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { messageAdmissionFileName } from "./message-admission-file";
import {
  MESSAGE_ADMISSIONS_DIRECTORY,
  messageAdmissionIdentity,
} from "./message-retry";

test("the receipt path is pinned: the runtime writer and the host reader address the same bytes", () => {
  expect(messageAdmissionFileName("assistant", "n")).toBe(
    "message-admissions/e2c75d434dc7082785c39a8fa859684b54a2383b1b8ecfc294c0a541ea544eb1.json",
  );
  expect(messageAdmissionFileName("Personal/Assistant", "nonce-1")).toBe(
    "message-admissions/89053ab950080cc14e9f49725c4ff1f1b7be41820b9bdedc28ee1a5e64e2e927.json",
  );
  expect(messageAdmissionFileName("assistant", "n")).toBe(
    `${MESSAGE_ADMISSIONS_DIRECTORY}/${createHash("sha256")
      .update(messageAdmissionIdentity("assistant", "n"))
      .digest("hex")}.json`,
  );
});

test("a conversation and a nonce cannot be shuffled into the same receipt", () => {
  expect(messageAdmissionFileName("a", "b/c")).not.toBe(
    messageAdmissionFileName("a/b", "c"),
  );
  expect(messageAdmissionFileName("../escape", "n")).toMatch(
    /^message-admissions\/[a-f0-9]{64}\.json$/,
  );
});

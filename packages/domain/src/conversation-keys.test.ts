import type { Routine } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  addressesMission,
  missionConversationId,
  missionConversationKey,
  recordConversationKind,
  routineConversationId,
} from "./conversation-keys";
import { createRoutine } from "./routines";

test("a mission with no explicit key is talked about at the convention address", () => {
  expect(missionConversationId("m1")).toBe("activity-m1");
  expect(missionConversationKey({ id: "m1" })).toBe("activity-m1");
});

test("an explicit session_key wins over the convention", () => {
  expect(missionConversationKey({ id: "m1", session_key: "conv-7" })).toBe(
    "conv-7",
  );
});

function routine(over: Partial<Routine> = {}): Routine {
  return {
    ...createRoutine(
      { name: "R", prompt: "p", schedule: "0 9 * * 1-5" },
      "r1",
      "2026-06-12T12:00:00.000Z",
    ),
    ...over,
  };
}

test("routineConversationId: shared reuses one chat, per_run is unique per run", () => {
  const shared = routine({ chat_mode: "shared" });
  expect(routineConversationId(shared, "run-1")).toBe("routine-r1");
  expect(routineConversationId(shared, "run-2")).toBe("routine-r1");

  const perRun = routine({ chat_mode: "per_run" });
  expect(routineConversationId(perRun, "run-1")).toBe("routine-r1-run-1");
  expect(routineConversationId(perRun, "run-2")).toBe("routine-r1-run-2");
});

test("a key Houston minted for a record says which record owns it", () => {
  expect(recordConversationKind("activity-m1")).toBe("mission");
  expect(recordConversationKind("routine-r1")).toBe("routine");
  expect(recordConversationKind("routine-r1-run-2")).toBe("routine");
});

test("a chat the person started belongs to no record", () => {
  expect(recordConversationKind("conv-1")).toBeNull();
  expect(
    recordConversationKind("3f1a0c5e-9b6d-4f2a-8c31-7d0e5a2b9c44"),
  ).toBeNull();
});

test("a differently-cased spelling is the same chat, so it reads as the same record", () => {
  // The store addresses a conversation by its id as a file name, and macOS and
  // Windows resolve `ACTIVITY-m1.json` to `activity-m1.json` — the same
  // transcript. A case-sensitive read here would call it an ordinary chat.
  expect(recordConversationKind("ACTIVITY-m1")).toBe("mission");
  expect(recordConversationKind("Routine-r1-run-2")).toBe("routine");
  expect(addressesMission({ id: "m1" }, "Activity-M1")).toBe(true);
  expect(
    addressesMission({ id: "m1", session_key: "Welcome-x" }, "welcome-X"),
  ).toBe(true);
});

test("a mission is addressed by its explicit key OR by the convention one", () => {
  const keyed = { id: "m1", session_key: "conv-7" };
  expect(addressesMission(keyed, "conv-7")).toBe(true);
  expect(addressesMission(keyed, "activity-m1")).toBe(true);
  expect(addressesMission(keyed, "activity-m2")).toBe(false);
  expect(addressesMission({ id: "m1" }, "activity-m1")).toBe(true);
  expect(addressesMission({ id: "m1" }, "conv-7")).toBe(false);
});

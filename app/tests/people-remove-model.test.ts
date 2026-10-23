import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { MemberRoutine } from "@houston/engine-adapter";
import {
  memberRoutineKey,
  removeRoutinesNote,
} from "../src/components/organization/people-remove-model.ts";

const routine: MemberRoutine = {
  routineId: "daily",
  name: "Daily summary",
  agentSlug: "a1",
  agentName: "Sales",
  kind: "schedule",
  enabled: true,
};

describe("removeRoutinesNote", () => {
  it("is loading until the read answers", () => {
    deepStrictEqual(removeRoutinesNote({ isError: false }), {
      kind: "loading",
    });
  });

  it("says nothing extra when the person set up no routine", () => {
    deepStrictEqual(
      removeRoutinesNote({ data: { routines: [] }, isError: false }),
      { kind: "none" },
    );
  });

  it("lists the routines that will stop", () => {
    deepStrictEqual(
      removeRoutinesNote({ data: { routines: [routine] }, isError: false }),
      { kind: "some", routines: [routine] },
    );
  });

  it("notes a failed check without blocking anything", () => {
    deepStrictEqual(removeRoutinesNote({ isError: true }), { kind: "failed" });
  });

  it("keeps the last answer through a failed refresh", () => {
    deepStrictEqual(
      removeRoutinesNote({ data: { routines: [routine] }, isError: true }),
      { kind: "some", routines: [routine] },
    );
  });
});

describe("memberRoutineKey", () => {
  it("tells apart the same routine id on two employees", () => {
    strictEqual(
      memberRoutineKey(routine) ===
        memberRoutineKey({ ...routine, agentSlug: "a2" }),
      false,
    );
  });
});

describe("isExpectedMemberRoutinesRefusal", () => {
  it("treats a gone member and a lost owner role as expected", async () => {
    const { isExpectedMemberRoutinesRefusal } = await import(
      "../src/lib/member-routines-refusal.ts"
    );
    strictEqual(isExpectedMemberRoutinesRefusal({ status: 404 }), true);
    strictEqual(isExpectedMemberRoutinesRefusal({ status: 403 }), true);
    strictEqual(isExpectedMemberRoutinesRefusal({ status: 500 }), false);
    strictEqual(isExpectedMemberRoutinesRefusal(new Error("x")), false);
    strictEqual(isExpectedMemberRoutinesRefusal(null), false);
  });
});

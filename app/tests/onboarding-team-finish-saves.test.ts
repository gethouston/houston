import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  rosterEdit,
  rosterRetrySaves,
} from "../src/components/onboarding/team/team-roster-edit.ts";
import {
  finishPressable,
  finishStep,
  type RosterMember,
  rosterJoin,
  rosterSettle,
  teamFinishState,
} from "../src/components/onboarding/team/team-roster-model.ts";
import {
  type RosterSaveHost,
  saveRosterMember,
} from "../src/components/onboarding/team/team-roster-save.ts";

const brief = { context: "Bakery", role: "Executive assistant" };

function hiredRoster(): RosterMember[] {
  const joined = rosterJoin([], {
    key: "hire-1",
    name: "Pax",
    color: "navy",
    brief,
  });
  return rosterSettle(joined, "hire-1", {
    kind: "hired",
    id: "pax",
    name: "Pax",
  });
}

function record(start: RosterMember[]) {
  let members = start;
  return {
    read: () => members,
    write: (next: RosterMember[]) => {
      members = next;
    },
    get members() {
      return members;
    },
  };
}

const okHost: RosterSaveHost = {
  whenReady: async () => {},
  rename: async (_id, name) => ({ id: name.toLowerCase() }),
  recolor: async () => {},
  rebrief: async () => {},
};

describe("finishing the card waits for edits still saving", () => {
  it("waits while a hired member shows an edit the host does not hold", () => {
    const edited = rosterEdit(hiredRoster(), "hire-1", { color: "forest" });
    strictEqual(teamFinishState(edited), "waiting");
    strictEqual(finishStep(teamFinishState(edited)), "wait");
  });

  it("finishes once the edit landed", async () => {
    const roster = record(
      rosterEdit(hiredRoster(), "hire-1", { color: "forest" }),
    );
    await saveRosterMember("hire-1", okHost, roster);
    strictEqual(teamFinishState(roster.members), "ready");
  });

  it("waits for a warming employee before finishing with its edit", async () => {
    let ready = () => {};
    const readiness = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const roster = record(
      rosterEdit(hiredRoster(), "hire-1", { color: "forest" }),
    );
    const saving = saveRosterMember(
      "hire-1",
      { ...okHost, whenReady: () => readiness },
      roster,
    );
    await new Promise((resolve) => setImmediate(resolve));
    strictEqual(teamFinishState(roster.members), "waiting");
    ready();
    await saving;
    strictEqual(teamFinishState(roster.members), "ready");
  });
});

describe("a save that fails", () => {
  it("keeps the edit on its card and holds the finish", async () => {
    const roster = record(
      rosterEdit(hiredRoster(), "hire-1", { color: "forest" }),
    );
    const failing = {
      ...okHost,
      recolor: async () => {
        throw new Error("host down");
      },
    };
    await saveRosterMember("hire-1", failing, roster);
    const [member] = roster.members;
    strictEqual(member.color, "forest");
    strictEqual(member.saved.color, "navy");
    strictEqual(member.saveFailed, true);
    strictEqual(teamFinishState(roster.members), "unsaved");
    strictEqual(finishPressable("unsaved"), true);
    strictEqual(finishStep("unsaved"), "cancel");
  });

  it("marks the member when the employee never takes writes, without throwing", async () => {
    const roster = record(
      rosterEdit(hiredRoster(), "hire-1", { color: "forest" }),
    );
    const broken = {
      ...okHost,
      whenReady: async () => {
        throw new Error("warm-up failed");
      },
    };
    await saveRosterMember("hire-1", broken, roster);
    strictEqual(roster.members[0].saveFailed, true);
    strictEqual(teamFinishState(roster.members), "unsaved");
  });

  it("is tried again by the next press, which waits for it", async () => {
    const roster = record(
      rosterEdit(hiredRoster(), "hire-1", { color: "forest" }),
    );
    await saveRosterMember(
      "hire-1",
      { ...okHost, recolor: () => Promise.reject(new Error("down")) },
      roster,
    );
    const retried = rosterRetrySaves(roster.members);
    deepStrictEqual(retried.keys, ["hire-1"]);
    strictEqual(teamFinishState(retried.members), "waiting");
    roster.write(retried.members);
    await saveRosterMember("hire-1", okHost, roster);
    strictEqual(roster.members[0].saved.color, "forest");
    strictEqual(teamFinishState(roster.members), "ready");
  });

  it("clears once the person edits the member again", async () => {
    const roster = record(
      rosterEdit(hiredRoster(), "hire-1", { color: "forest" }),
    );
    await saveRosterMember(
      "hire-1",
      { ...okHost, recolor: () => Promise.reject(new Error("down")) },
      roster,
    );
    const edited = rosterEdit(roster.members, "hire-1", { color: "plum" });
    strictEqual(edited[0].saveFailed, false);
    strictEqual(teamFinishState(edited), "waiting");
  });

  it("a rename the host refused goes back and never holds the finish", async () => {
    const roster = record(
      rosterEdit(hiredRoster(), "hire-1", { name: "Olivia" }),
    );
    await saveRosterMember(
      "hire-1",
      { ...okHost, rename: async () => null },
      roster,
    );
    strictEqual(roster.members[0].name, "Pax");
    strictEqual(roster.members[0].saveFailed, false);
    strictEqual(teamFinishState(roster.members), "ready");
  });
});

describe("a later save after one that failed", () => {
  it("clears the earlier failure while it runs, and finishes once it lands", async () => {
    const roster = record(
      rosterEdit(hiredRoster(), "hire-1", { color: "forest" }),
    );
    let fail = () => {};
    const first = saveRosterMember(
      "hire-1",
      {
        ...okHost,
        recolor: () =>
          new Promise<void>((_resolve, reject) => {
            fail = () => reject(new Error("down"));
          }),
      },
      roster,
    );
    await new Promise((resolve) => setImmediate(resolve));
    roster.write(rosterEdit(roster.members, "hire-1", { color: "plum" }));
    fail();
    await first;
    strictEqual(roster.members[0].saveFailed, true);
    let land = () => {};
    const second = saveRosterMember(
      "hire-1",
      {
        ...okHost,
        recolor: () =>
          new Promise<void>((resolve) => {
            land = resolve;
          }),
      },
      roster,
    );
    await new Promise((resolve) => setImmediate(resolve));
    strictEqual(teamFinishState(roster.members), "waiting");
    land();
    await second;
    strictEqual(roster.members[0].saved.color, "plum");
    strictEqual(teamFinishState(roster.members), "ready");
  });
});

import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { rosterEdit } from "../src/components/onboarding/team/team-roster-edit.ts";
import {
  type RosterMember,
  rosterJoin,
  rosterSettle,
} from "../src/components/onboarding/team/team-roster-model.ts";
import {
  type RosterSaveHost,
  saveRosterMember,
} from "../src/components/onboarding/team/team-roster-save.ts";

const brief = { context: "Bakery", role: "Executive assistant" };
const newBrief = { context: "Bakery", role: "Bookkeeper" };

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
    get member() {
      return members[0];
    },
  };
}

function host(overrides: Partial<RosterSaveHost> = {}) {
  const calls: string[] = [];
  const base: RosterSaveHost = {
    whenReady: async () => {},
    rename: async (id, name) => {
      calls.push(`rename:${id}:${name}`);
      return { id: name.toLowerCase() };
    },
    recolor: async (id, color) => {
      calls.push(`recolor:${id}:${color}`);
    },
    rebrief: async (id, next) => {
      calls.push(`rebrief:${id}:${next.role}`);
    },
  };
  return { calls, host: { ...base, ...overrides } };
}

describe("saving a roster edit step by step", () => {
  it("keeps a rename that landed when the recolor after it fails", async () => {
    const roster = record(
      rosterEdit(hiredRoster(), "hire-1", { name: "Olivia", color: "forest" }),
    );
    const { host: h } = host({
      recolor: async () => {
        throw new Error("host down");
      },
    });
    await saveRosterMember("hire-1", h, roster);
    strictEqual(roster.member.name, "Olivia");
    strictEqual(roster.member.saved.name, "Olivia");
    deepStrictEqual(roster.member.status, { kind: "hired", id: "olivia" });
    strictEqual(roster.member.color, "forest");
    strictEqual(roster.member.saved.color, "navy");
    strictEqual(roster.member.saveFailed, true);
  });

  it("still saves the color and brief when the rename is refused", async () => {
    const roster = record(
      rosterEdit(hiredRoster(), "hire-1", {
        name: "Olivia",
        color: "forest",
        brief: newBrief,
      }),
    );
    const { calls, host: h } = host({ rename: async () => null });
    await saveRosterMember("hire-1", h, roster);
    strictEqual(roster.member.name, "Pax");
    strictEqual(roster.member.color, "forest");
    strictEqual(roster.member.saved.color, "forest");
    deepStrictEqual(roster.member.saved.brief, newBrief);
    deepStrictEqual(calls, ["recolor:pax:forest", "rebrief:pax:Bookkeeper"]);
  });

  it("waits for a warming employee before writing its new brief", async () => {
    let warming = true;
    let ready = () => {};
    const readiness = new Promise<void>((resolve) => {
      ready = () => {
        warming = false;
        resolve();
      };
    });
    const roster = record(
      rosterEdit(hiredRoster(), "hire-1", { brief: newBrief }),
    );
    const { calls, host: h } = host({
      whenReady: () => readiness,
      rebrief: async (id, next) => {
        if (warming) throw new Error("still warming");
        calls.push(`rebrief:${id}:${next.role}`);
      },
    });
    const saving = saveRosterMember("hire-1", h, roster);
    await new Promise((resolve) => setImmediate(resolve));
    deepStrictEqual(calls, []);
    ready();
    await saving;
    deepStrictEqual(calls, ["rebrief:pax:Bookkeeper"]);
    deepStrictEqual(roster.member.brief, newBrief);
    deepStrictEqual(roster.member.saved.brief, newBrief);
  });
});

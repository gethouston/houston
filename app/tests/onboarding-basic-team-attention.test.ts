import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type BasicTeamDraft,
  basicTeamDefaults,
  basicTeamOffscreenFailures,
} from "../src/components/onboarding/team/basic-team-model.ts";
import {
  rosterEdit,
  rosterSaveMark,
} from "../src/components/onboarding/team/team-roster-edit.ts";
import {
  finishStep,
  type RosterMember,
  rosterJoin,
  rosterRemove,
  rosterRetry,
  rosterSettle,
  teamFinishState,
} from "../src/components/onboarding/team/team-roster-model.ts";

const brief = { context: "Bakery", role: "Baker" };
const join = (members: readonly RosterMember[], key: string, name: string) =>
  rosterJoin(members, { key, name, color: "navy", brief });
const fail = (members: readonly RosterMember[], key: string) =>
  rosterSettle(members, key, { kind: "failed", reason: "failed" });
const hired = (members: readonly RosterMember[], key: string, name: string) =>
  rosterSettle(members, key, { kind: "hired", id: `id-${key}`, name });
const names = (members: readonly RosterMember[]) =>
  members.map((member) => member.name);

/** The three starters, each on the roster under `keys[i]`. */
const starters = (keys: readonly string[]): BasicTeamDraft[] =>
  basicTeamDefaults((id) => id).map((draft, at) => ({
    ...draft,
    rosterKey: keys[at] ?? null,
  }));

describe("basic team: a failed one-by-one hire", () => {
  it("is named on the basic screen when it cancels the finish", () => {
    let roster = fail(join([], "hire-1", "Ava"), "hire-1");
    for (const key of ["hire-2", "hire-3", "hire-4"]) {
      roster = hired(join(roster, key, key), key, key);
    }
    const drafts = starters(["hire-2", "hire-3", "hire-4"]);

    strictEqual(finishStep(teamFinishState(roster)), "cancel");
    deepStrictEqual(names(basicTeamOffscreenFailures(drafts, roster)), ["Ava"]);
  });

  it("leaves a starter's failure to its own badge", () => {
    const roster = fail(join([], "hire-1", "Executive assistant"), "hire-1");
    deepStrictEqual(
      basicTeamOffscreenFailures(starters(["hire-1"]), roster),
      [],
    );
  });

  it("ignores hires still on their way or already hired", () => {
    const roster = hired(
      join(join([], "hire-1", "Ava"), "hire-2", "Pax"),
      "hire-2",
      "Pax",
    );
    deepStrictEqual(basicTeamOffscreenFailures(starters([]), roster), []);
  });

  it("clears once the hire is retried or removed, freeing the finish", () => {
    const drafts = starters([]);
    const roster = fail(join([], "hire-1", "Ava"), "hire-1");

    const retried = rosterRetry(roster, "hire-1", []);
    if (!retried) throw new Error("a failed hire can be retried");
    deepStrictEqual(basicTeamOffscreenFailures(drafts, retried.members), []);
    strictEqual(teamFinishState(retried.members), "waiting");

    const removed = rosterRemove(roster, "hire-1");
    deepStrictEqual(basicTeamOffscreenFailures(drafts, removed), []);
  });
});

describe("basic team: a one-by-one hire whose edit did not save", () => {
  it("is named on the basic screen, since the next press sends it again", () => {
    let roster = hired(join([], "hire-1", "Ava"), "hire-1", "Ava");
    roster = rosterSaveMark(
      rosterEdit(roster, "hire-1", { color: "plum" }),
      "hire-1",
      true,
    );
    const drafts = starters([]);
    strictEqual(teamFinishState(roster), "unsaved");
    deepStrictEqual(names(basicTeamOffscreenFailures(drafts, roster)), ["Ava"]);
  });
});

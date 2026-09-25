import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  finishPressable,
  finishStep,
  type RosterMember,
  rosterJoin,
  rosterRemove,
  rosterRetry,
  rosterSettle,
  teamFinishState,
} from "../src/components/onboarding/team/team-roster-model.ts";

const brief = { context: "Bakery", role: "Executive assistant" };
const join = (members: readonly RosterMember[], key: string, name: string) =>
  rosterJoin(members, { key, name, color: "navy", brief });
const kinds = (members: readonly RosterMember[]) =>
  members.map((member) => member.status.kind);

describe("optimistic hire", () => {
  it("joins at once and settles hired, under the name the host created", () => {
    const joined = join([], "hire-1", "Pax");
    deepStrictEqual(kinds(joined), ["joining"]);
    const hired = rosterSettle(joined, "hire-1", {
      kind: "hired",
      id: "agent-1",
      name: "Pax",
    });
    deepStrictEqual(hired[0].status, { kind: "hired", id: "agent-1" });
    strictEqual(hired[0].name, "Pax");
  });

  it("settles a failure on its own member only", () => {
    const two = join(join([], "hire-1", "Pax"), "hire-2", "Quill");
    const settled = rosterSettle(two, "hire-2", {
      kind: "failed",
      reason: "failed",
    });
    deepStrictEqual(kinds(settled), ["joining", "failed"]);
  });

  it("ignores a late answer for a member no longer joining or gone", () => {
    const hired = rosterSettle(join([], "hire-1", "Pax"), "hire-1", {
      kind: "hired",
      id: "agent-1",
      name: "Pax",
    });
    const late = rosterSettle(hired, "hire-1", {
      kind: "failed",
      reason: "failed",
    });
    deepStrictEqual(late, hired);
    deepStrictEqual(
      rosterSettle(hired, "hire-9", { kind: "failed", reason: "failed" }),
      hired,
    );
  });
});

describe("retry and removal", () => {
  const failed = (reason: "nameTaken" | "failed") =>
    rosterSettle(join(join([], "hire-1", "Pax"), "hire-2", "Ava"), "hire-2", {
      kind: "failed",
      reason,
    });

  it("retries a failed create under the same name", () => {
    const next = rosterRetry(failed("failed"), "hire-2", []);
    strictEqual(next?.retried.name, "Ava");
    deepStrictEqual(kinds(next?.members ?? []), ["joining", "joining"]);
  });

  it("retries a name someone else took under the first free variant", () => {
    const next = rosterRetry(failed("nameTaken"), "hire-2", ["Ava", "Ava 2"]);
    strictEqual(next?.retried.name, "Ava 3");
    strictEqual(next?.members[1].name, "Ava 3");
  });

  it("refuses to retry a member that did not fail", () => {
    strictEqual(rosterRetry(failed("failed"), "hire-1", []), null);
    strictEqual(rosterRetry(failed("failed"), "hire-9", []), null);
  });

  it("lets go of a failed member only", () => {
    const roster = failed("failed");
    deepStrictEqual(
      rosterRemove(roster, "hire-2").map((m) => m.key),
      ["hire-1"],
    );
    deepStrictEqual(rosterRemove(roster, "hire-1"), roster);
  });
});

describe("finishing the card", () => {
  it("has nothing to finish with an empty roster", () => {
    strictEqual(teamFinishState([]), "empty");
    strictEqual(finishPressable(teamFinishState([])), false);
    strictEqual(finishStep("empty"), "cancel");
  });

  it("a resumed run finishes with the team it hired before the restart", () => {
    // The roster only holds this mount's hires; the employees an interrupted
    // run already hired exist in the workspace and count toward the team.
    strictEqual(teamFinishState([], 2), "ready");
    strictEqual(finishPressable(teamFinishState([], 2)), true);
    const failed = rosterSettle(join([], "hire-1", "Pax"), "hire-1", {
      kind: "failed",
      reason: "failed",
    });
    strictEqual(teamFinishState(failed, 2), "failed");
  });

  it("offers Done while hires are on their way, and waits for them", () => {
    const joining = join([], "hire-1", "Pax");
    strictEqual(teamFinishState(joining), "waiting");
    strictEqual(finishPressable(teamFinishState(joining)), true);
    strictEqual(finishStep("waiting"), "wait");
  });

  it("finishes once everyone landed", () => {
    const hired = rosterSettle(join([], "hire-1", "Pax"), "hire-1", {
      kind: "hired",
      id: "agent-1",
      name: "Pax",
    });
    strictEqual(teamFinishState(hired), "ready");
    strictEqual(finishStep("ready"), "finish");
  });

  it("holds Done on a failure, and gives up a press waiting on it", () => {
    const failed = rosterSettle(join([], "hire-1", "Pax"), "hire-1", {
      kind: "failed",
      reason: "failed",
    });
    strictEqual(teamFinishState(failed), "failed");
    strictEqual(finishPressable(teamFinishState(failed)), false);
    strictEqual(finishStep("failed"), "cancel");
    // Still waiting beats failed: the press holds until every create answers.
    const mixed = join(failed, "hire-2", "Quill");
    strictEqual(teamFinishState(mixed), "waiting");
  });
});

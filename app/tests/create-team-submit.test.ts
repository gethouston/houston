import assert from "node:assert/strict";
import test from "node:test";
import {
  createTeamAction,
  createTeamSubmitOutcome,
  memberAddFallout,
  teamMemberName,
} from "../src/components/shell/create-team-submit.ts";

test("a team that took everyone lands the user in it and says nothing", () => {
  const outcome = createTeamSubmitOutcome({
    createdId: "team_1",
    failedMembers: [],
  });
  assert.deepEqual(outcome.land, { teamId: "team_1" });
  assert.equal(outcome.toast, null);
});

test("the user lands in the team even when it could not take everyone", () => {
  const outcome = createTeamSubmitOutcome({
    createdId: "team_1",
    failedMembers: ["ana@acme.com", "bo@acme.com"],
  });
  assert.deepEqual(outcome.land, { teamId: "team_1" });
  assert.deepEqual(outcome.toast, {
    names: ["ana@acme.com", "bo@acme.com"],
  });
});

test("the toast names exactly the people who were left out", () => {
  const outcome = createTeamSubmitOutcome({
    createdId: "team_1",
    failedMembers: ["ana@acme.com", "cy@acme.com"],
  });
  // The third of the three went in; only the two refusals are named.
  assert.deepEqual(outcome.toast?.names, ["ana@acme.com", "cy@acme.com"]);
});

test("no team means nowhere to land and nothing to say", () => {
  const outcome = createTeamSubmitOutcome({
    createdId: null,
    failedMembers: [],
  });
  assert.equal(outcome.land, null);
  assert.equal(outcome.toast, null);
});

test("a submission with no team yet creates one", () => {
  assert.deepEqual(createTeamAction(null), { kind: "create" });
});

test("a second press finishes the team the first one made, never a second team", () => {
  const first = createTeamAction(null);
  assert.equal(first.kind, "create");
  // The create succeeded, so the submission is holding a team from here on.
  assert.deepEqual(createTeamAction("team_1"), {
    kind: "resume",
    teamId: "team_1",
  });
});

test("a person is named in the toast the way the picker named them", () => {
  assert.equal(
    teamMemberName({ userId: "u_1", email: "ana@acme.com" }),
    "ana@acme.com",
  );
  assert.equal(teamMemberName({ userId: "u_1" }), "u_1");
});

// What a refused member add costs: the EXPECTED gateway states are answers the
// user reads in the one summary toast, everything else is a bug we must see.

/** The FLAT `{error, code}` body the Go edge answers a rejection with. */
const refusal = (code: string) => ({ body: { error: "a sentence", code } });

test("an expected gateway refusal is named to the user and never reported", () => {
  const fallout = memberAddFallout([
    { name: "ana@acme.com", error: refusal("not_team_owner") },
  ]);
  assert.deepEqual(fallout.report, []);
  assert.deepEqual(fallout.names, ["ana@acme.com"]);
});

test("an unexpected refusal is reported exactly once, and named too", () => {
  const boom = new Error("500 gateway exploded");
  const fallout = memberAddFallout([{ name: "bo@acme.com", error: boom }]);
  assert.deepEqual(fallout.report, [boom]);
  assert.deepEqual(fallout.names, ["bo@acme.com"]);
});

test("a mix reports only the bug, and names everyone the team could not take", () => {
  const boom = new Error("500 gateway exploded");
  const fallout = memberAddFallout([
    { name: "ana@acme.com", error: refusal("personal_space") },
    { name: "bo@acme.com", error: boom },
    { name: "cy@acme.com", error: refusal("invalid_team_id") },
  ]);
  assert.equal(fallout.report.length, 1);
  assert.equal(fallout.report[0], boom);
  assert.deepEqual(fallout.names, [
    "ana@acme.com",
    "bo@acme.com",
    "cy@acme.com",
  ]);
});

test("a team that took everyone owes no report and nothing to say", () => {
  const fallout = memberAddFallout([]);
  assert.deepEqual(fallout.report, []);
  assert.deepEqual(fallout.names, []);
  assert.equal(
    createTeamSubmitOutcome({
      createdId: "team_1",
      failedMembers: fallout.names,
    }).toast,
    null,
  );
});

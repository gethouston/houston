import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import type { AgentMoveStatus, OrgSummary } from "@houston/engine-adapter";
import {
  isExpectedMoveAnswer,
  isExpectedShareError,
} from "../src/lib/share-error.ts";
import {
  addInviteEmails,
  applyMovePoll,
  assertInviteReady,
  canRetryMove,
  createFailed,
  finish,
  initialState,
  isDismissable,
  markInviteFailed,
  markInviteSending,
  markInviteSent,
  moveRejected,
  moveTimedOut,
  ownableTeams,
  pickTeam,
  reconcileCreatedTeam,
  retrySwitch,
  type ShareViaTeamState,
  sendableInvites,
  startCreate,
  startMove,
  switchDone,
  switchFailed,
} from "../src/lib/share-via-team.ts";

const TEAM = { slug: "abcdef0123456789", name: "Acme" };

function org(over: Partial<OrgSummary>): OrgSummary {
  return {
    id: "id",
    slug: "0000000000000000",
    name: "Org",
    kind: "team",
    role: "owner",
    memberCount: 1,
    degraded: false,
    ...over,
  };
}

describe("initialState", () => {
  it("rests on the pick step, not creating, no error", () => {
    deepStrictEqual(initialState(), {
      step: "pick",
      creating: false,
      createError: null,
    });
  });
});

describe("ownableTeams", () => {
  it("keeps only team spaces the caller owns or admins, sorted by name", () => {
    const orgs = [
      org({ slug: "1111111111111111", name: "Zeta", role: "owner" }),
      org({ slug: "2222222222222222", name: "Alpha", role: "admin" }),
      org({ slug: "3333333333333333", name: "Member", role: "user" }),
      org({ slug: "4444444444444444", name: "Personal", kind: "personal" }),
    ];
    deepStrictEqual(ownableTeams(orgs), [
      { slug: "2222222222222222", name: "Alpha" },
      { slug: "1111111111111111", name: "Zeta" },
    ]);
  });

  it("is empty when the user owns/admins no team", () => {
    deepStrictEqual(ownableTeams([org({ role: "user" })]), []);
  });
});

describe("create sub-flow", () => {
  it("startCreate enters the creating sub-state and clears any prior error", () => {
    const errored = createFailed(initialState(), "boom");
    deepStrictEqual(startCreate(errored), {
      step: "pick",
      creating: true,
      createError: null,
    });
  });

  it("createFailed surfaces the message and stops the spinner", () => {
    deepStrictEqual(createFailed(startCreate(initialState()), "network"), {
      step: "pick",
      creating: false,
      createError: "network",
    });
  });

  it("startCreate / createFailed are no-ops off the pick step", () => {
    const confirm = pickTeam(TEAM);
    strictEqual(startCreate(confirm), confirm);
    strictEqual(createFailed(confirm, "x"), confirm);
  });
});

describe("reconcileCreatedTeam (lost create response)", () => {
  it("returns the owner-role team matching the name we tried to create", () => {
    const orgs = [
      org({ slug: "aaaaaaaaaaaaaaaa", name: "  Acme ", role: "owner" }),
    ];
    deepStrictEqual(reconcileCreatedTeam(orgs, "acme"), {
      slug: "aaaaaaaaaaaaaaaa",
      name: "  Acme ",
    });
  });

  it("ignores a same-name team we only admin (someone else created it)", () => {
    strictEqual(
      reconcileCreatedTeam([org({ name: "Acme", role: "admin" })], "Acme"),
      null,
    );
  });

  it("ignores a personal space of the same name", () => {
    strictEqual(
      reconcileCreatedTeam(
        [org({ name: "Acme", kind: "personal", role: "owner" })],
        "Acme",
      ),
      null,
    );
  });

  it("returns null when nothing matches (safe to retry the create)", () => {
    strictEqual(reconcileCreatedTeam([], "Acme"), null);
  });
});

describe("move pipeline", () => {
  it("pickTeam advances to confirm", () => {
    deepStrictEqual(pickTeam(TEAM), { step: "confirm", team: TEAM });
  });

  it("startMove begins polling from confirm", () => {
    deepStrictEqual(startMove(pickTeam(TEAM), "mv1"), {
      step: "moving",
      team: TEAM,
      moveId: "mv1",
    });
  });

  it("startMove is a no-op from moving (no double-move)", () => {
    const moving = startMove(pickTeam(TEAM), "mv1");
    strictEqual(startMove(moving, "mv2"), moving);
  });

  it("a still-moving poll leaves the state untouched", () => {
    const moving = startMove(pickTeam(TEAM), "mv1");
    strictEqual(applyMovePoll(moving, { status: "moving" }), moving);
  });

  it("a done poll advances to the explicit switching step", () => {
    const moving = startMove(pickTeam(TEAM), "mv1");
    deepStrictEqual(applyMovePoll(moving, { status: "done" }), {
      step: "switching",
      team: TEAM,
    });
  });

  it("a failed poll classifies the error and keeps the team", () => {
    const moving = startMove(pickTeam(TEAM), "mv1");
    const status: AgentMoveStatus = {
      status: "failed",
      error: "unmovable_volume",
    };
    deepStrictEqual(applyMovePoll(moving, status), {
      step: "moveFailed",
      team: TEAM,
      error: "unmovable_volume",
    });
  });

  it("applyMovePoll only acts while moving", () => {
    const confirm = pickTeam(TEAM);
    strictEqual(applyMovePoll(confirm, { status: "done" }), confirm);
  });
});

describe("move rejection + retry", () => {
  it("moveRejected from confirm classifies the code", () => {
    deepStrictEqual(moveRejected(pickTeam(TEAM), "unsupported_move"), {
      step: "moveFailed",
      team: TEAM,
      error: "unsupported_move",
    });
  });

  it("an agent already in the team skips straight to the space switch", () => {
    deepStrictEqual(moveRejected(pickTeam(TEAM), "agent_moved"), {
      step: "switching",
      team: TEAM,
    });
  });

  it("retryable errors allow re-issuing the move from moveFailed", () => {
    const failed = moveRejected(pickTeam(TEAM), "needs_upgrade");
    strictEqual(canRetryMove(failed), true);
  });

  it("unmovable_volume is terminal: no retry (contact support)", () => {
    const failed = moveRejected(pickTeam(TEAM), "unmovable_volume");
    strictEqual(canRetryMove(failed), false);
  });

  it("name_taken is its own authored state, with no retry until a rename", () => {
    const failed = moveRejected(pickTeam(TEAM), "name_taken");
    deepStrictEqual(failed, {
      step: "moveFailed",
      team: TEAM,
      error: "name_taken",
    });
    strictEqual(canRetryMove(failed), false);
    strictEqual(isDismissable(failed), true);
  });

  it("startMove resumes from a retryable moveFailed", () => {
    const failed = moveRejected(pickTeam(TEAM), "needs_upgrade");
    deepStrictEqual(startMove(failed, "mv2"), {
      step: "moving",
      team: TEAM,
      moveId: "mv2",
    });
  });

  it("a wall-clock timeout on moving surfaces a closable, retryable moveFailed", () => {
    const moving = startMove(pickTeam(TEAM), "mv1");
    const timedOut = moveTimedOut(moving);
    deepStrictEqual(timedOut, {
      step: "moveFailed",
      team: TEAM,
      error: "timeout",
    });
    // Closable (not moving/switching) and retryable (not unmovable_volume).
    strictEqual(isDismissable(timedOut), true);
    strictEqual(canRetryMove(timedOut), true);
  });

  it("moveTimedOut only acts while moving", () => {
    const confirm = pickTeam(TEAM);
    strictEqual(moveTimedOut(confirm), confirm);
    const switching = applyMovePoll(startMove(confirm, "m"), {
      status: "done",
    });
    strictEqual(moveTimedOut(switching), switching);
  });
});

describe("switch then invite (pipeline order is law)", () => {
  const moving = startMove(pickTeam(TEAM), "mv1");
  const switching = applyMovePoll(moving, { status: "done" });

  it("switchDone opens the invite step with an empty roster", () => {
    deepStrictEqual(switchDone(switching), {
      step: "invite",
      team: TEAM,
      invites: [],
    });
  });

  it("assertInviteReady throws before the invite step", () => {
    throws(() => assertInviteReady(moving), /before move\+switch completed/);
    throws(() => assertInviteReady(switching), /before move\+switch completed/);
    throws(() => assertInviteReady(pickTeam(TEAM)));
  });

  it("assertInviteReady passes on the invite step", () => {
    assertInviteReady(switchDone(switching));
  });

  it("switchDone ends a move into Personal, with nobody to invite", () => {
    const personal = {
      slug: "ffffffffffffffff",
      name: "Personal",
      personal: true,
    };
    deepStrictEqual(switchDone({ step: "switching", team: personal }), {
      step: "done",
      team: personal,
    });
  });

  it("switchDone only acts from switching", () => {
    strictEqual(switchDone(moving), moving);
  });

  it("switchFailed does NOT advance to invite (never invite in the personal space)", () => {
    deepStrictEqual(switchFailed(switching), {
      step: "switchFailed",
      team: TEAM,
    });
    // The failure is closable, and it is emphatically NOT the invite step.
    strictEqual(isDismissable(switchFailed(switching)), true);
    throws(() => assertInviteReady(switchFailed(switching)));
  });

  it("retrySwitch re-enters switching from switchFailed", () => {
    const failed = switchFailed(switching);
    deepStrictEqual(retrySwitch(failed), { step: "switching", team: TEAM });
  });

  it("switchFailed / retrySwitch are no-ops off their source step", () => {
    strictEqual(switchFailed(moving), moving);
    strictEqual(retrySwitch(switching), switching);
  });
});

describe("isExpectedShareError (silence C8 states from the bug toast)", () => {
  for (const code of [
    "unsupported_move",
    "unmovable_volume",
    "needs_upgrade",
    "name_taken",
    "already_member",
  ]) {
    it(`silences the expected C8 code ${code}`, () => {
      strictEqual(isExpectedShareError({ kind: code }), true);
      strictEqual(isExpectedShareError({ body: { error: code } }), true);
    });
  }

  it("does NOT silence an unexpected error (keeps the generic bug toast)", () => {
    strictEqual(isExpectedShareError({ kind: "internal_error" }), false);
    strictEqual(isExpectedShareError(new Error("boom")), false);
    strictEqual(isExpectedShareError(null), false);
    strictEqual(isExpectedShareError(undefined), false);
  });
});

describe("isExpectedMoveAnswer (what a move wire keeps out of Sentry)", () => {
  it("covers every expected share state plus a live move owning the agent", () => {
    strictEqual(isExpectedMoveAnswer({ kind: "name_taken" }), true);
    strictEqual(isExpectedMoveAnswer({ body: { code: "name_taken" } }), true);
    strictEqual(isExpectedMoveAnswer({ code: "move_in_progress" }), true);
  });

  it("covers a move the agent already finished (agent_moved)", () => {
    strictEqual(isExpectedMoveAnswer({ body: { code: "agent_moved" } }), true);
  });

  it("covers an agent in neither space (coded agent_not_found)", () => {
    strictEqual(
      isExpectedMoveAnswer({ body: { code: "agent_not_found" } }),
      true,
    );
  });

  it("still reports an older gateway's uncoded 404", () => {
    strictEqual(
      isExpectedMoveAnswer({ status: 404, body: { error: "agent not found" } }),
      false,
    );
  });

  it("still reports an unexpected move failure", () => {
    strictEqual(isExpectedMoveAnswer({ kind: "internal_error" }), false);
    strictEqual(isExpectedMoveAnswer(new Error("boom")), false);
  });
});

describe("invite roster", () => {
  it("adds trimmed, de-duped emails as pending", () => {
    const one = addInviteEmails([], ["a@x.co", " a@x.co ", "b@x.co", ""]);
    deepStrictEqual(one, [
      { email: "a@x.co", status: "pending" },
      { email: "b@x.co", status: "pending" },
    ]);
  });

  it("tracks per-email sending / sent / failed transitions", () => {
    let invites = addInviteEmails([], ["a@x.co", "b@x.co"]);
    invites = markInviteSending(invites, "a@x.co");
    strictEqual(invites[0].status, "sending");
    invites = markInviteSent(invites, "a@x.co");
    strictEqual(invites[0].status, "sent");
    invites = markInviteFailed(invites, "b@x.co", "already_member");
    deepStrictEqual(invites[1], {
      email: "b@x.co",
      status: "failed",
      error: "already_member",
    });
  });

  it("sendableInvites is pending + failed only (retry just the failures)", () => {
    let invites = addInviteEmails([], ["a@x.co", "b@x.co", "c@x.co"]);
    invites = markInviteSent(invites, "a@x.co");
    invites = markInviteFailed(invites, "b@x.co", "boom");
    deepStrictEqual(
      sendableInvites(invites).map((i) => i.email),
      ["b@x.co", "c@x.co"],
    );
  });

  it("finish completes only from the invite step", () => {
    const invite = switchDone(
      applyMovePoll(startMove(pickTeam(TEAM), "m"), { status: "done" }),
    );
    deepStrictEqual(finish(invite), { step: "done", team: TEAM });
    const moving = startMove(pickTeam(TEAM), "m");
    strictEqual(finish(moving), moving);
  });
});

describe("isDismissable", () => {
  const cases: Array<[ShareViaTeamState, boolean]> = [
    [initialState(), true],
    [pickTeam(TEAM), true],
    [{ step: "moving", team: TEAM, moveId: "m" }, false],
    [{ step: "switching", team: TEAM }, false],
    [{ step: "switchFailed", team: TEAM }, true],
    [{ step: "moveFailed", team: TEAM, error: "unknown" }, true],
    [{ step: "invite", team: TEAM, invites: [] }, true],
    [{ step: "done", team: TEAM }, true],
  ];
  for (const [state, expected] of cases) {
    it(`${state.step} -> ${expected}`, () => {
      strictEqual(isDismissable(state), expected);
    });
  }
});

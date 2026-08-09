import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bootGuardStep,
  deadViewStep,
  INITIAL_BOOT_GUARD,
} from "../src/components/shell/view-guard-rules.ts";
import type { TeamView } from "../src/lib/teams-model.ts";

const team = (id: string): TeamView =>
  ({ id, name: id, agents: [] }) as unknown as TeamView;

const TEAMS = [team("team-a"), team("team-b")];

describe("bootGuardStep", () => {
  it("arms on the first run instead of looking already booted", () => {
    // `undefined` (never run) must not read as `null` (a resolved "no
    // workspace"), or a deployment without one would never boot at all.
    const step = bootGuardStep(INITIAL_BOOT_GUARD, {
      workspaceId: null,
      viewMode: "inbox",
      hasHomeTeam: true,
    });
    assert.equal(step.action, "wait");
    assert.deepEqual(step.state, { workspaceId: null, armed: true });
  });

  it("waits on the Inbox while no team has resolved, staying armed", () => {
    const armed = { workspaceId: "ws-1", armed: true };
    const step = bootGuardStep(armed, {
      workspaceId: "ws-1",
      viewMode: "inbox",
      hasHomeTeam: false,
    });
    assert.equal(step.action, "wait");
    assert.equal(step.state.armed, true);
  });

  it("opens home the moment the first team lands, once", () => {
    const armed = { workspaceId: "ws-1", armed: true };
    const first = bootGuardStep(armed, {
      workspaceId: "ws-1",
      viewMode: "inbox",
      hasHomeTeam: true,
    });
    assert.equal(first.action, "open-home-team");
    assert.equal(first.state.armed, false);

    // Back on the Inbox later by the user's own click: never yanked again.
    const again = bootGuardStep(first.state, {
      workspaceId: "ws-1",
      viewMode: "inbox",
      hasHomeTeam: true,
    });
    assert.equal(again.action, "wait");
  });

  it("disarms when the user navigates during the teams read", () => {
    const armed = { workspaceId: "ws-1", armed: true };
    const moved = bootGuardStep(armed, {
      workspaceId: "ws-1",
      viewMode: "agent-store",
      hasHomeTeam: false,
    });
    assert.equal(moved.action, "wait");
    assert.equal(moved.state.armed, false);

    // The teams land and the user is back on the Inbox: their click stands.
    const later = bootGuardStep(moved.state, {
      workspaceId: "ws-1",
      viewMode: "inbox",
      hasHomeTeam: true,
    });
    assert.equal(later.action, "wait");
  });

  it("re-arms on a workspace change without reading the outgoing view", () => {
    const done = { workspaceId: "ws-1", armed: false };
    // The view open on the tick the id changes belongs to the space just LEFT,
    // so it must not disarm the new one (a space switch lands on home, which is
    // the Inbox while the new space's teams are in flight).
    const switched = bootGuardStep(done, {
      workspaceId: "ws-2",
      viewMode: "team",
      hasHomeTeam: false,
    });
    assert.deepEqual(switched.state, { workspaceId: "ws-2", armed: true });

    const landed = bootGuardStep(switched.state, {
      workspaceId: "ws-2",
      viewMode: "inbox",
      hasHomeTeam: true,
    });
    assert.equal(landed.action, "open-home-team");
  });
});

describe("deadViewStep", () => {
  const base = {
    showAiModels: true,
    showOrganization: true,
    gatesReady: true,
    teams: TEAMS,
    activeTeamId: "team-a",
  };

  it("keeps a live view", () => {
    assert.equal(deadViewStep({ ...base, viewMode: "inbox" }), "keep");
    assert.equal(deadViewStep({ ...base, viewMode: "team" }), "keep");
    assert.equal(deadViewStep({ ...base, viewMode: "about-me" }), "keep");
    assert.equal(deadViewStep({ ...base, viewMode: "organization" }), "keep");
  });

  it("sends a view no screen answers to home", () => {
    assert.equal(deadViewStep({ ...base, viewMode: "chat" }), "go-home");
  });

  it("sends a role-blocked view home", () => {
    assert.equal(
      deadViewStep({ ...base, viewMode: "ai-hub", showAiModels: false }),
      "go-home",
    );
  });

  it("sends a RETIRED view home whatever the gates say", () => {
    // The Permissions screen and the standalone Time worked screen are gone (a
    // team's Manage agents section, and a lens inside Admin > Analytics). No
    // gate can make either valid again, so a `viewMode` an older session
    // persisted must go home rather than strand the user on a blank card.
    for (const viewMode of ["permissions", "time-worked"]) {
      assert.equal(deadViewStep({ ...base, viewMode }), "go-home", viewMode);
    }
  });

  it("sends Admin home once the org gate resolves against it", () => {
    // A role demotion, or a switch back to the personal space, hides it. The
    // screen the user left open is then unmounted, so staying would strand them
    // on a blank card.
    assert.equal(
      deadViewStep({
        ...base,
        viewMode: "organization",
        showOrganization: false,
      }),
      "go-home",
    );
  });

  it("waits out a gated view while the capabilities are still loading", () => {
    // Every gate reads false off null capabilities, so acting on that window
    // would bounce the user off a screen they are entitled to, on every boot
    // and every space switch.
    for (const viewMode of ["ai-hub", "organization"]) {
      assert.equal(
        deadViewStep({
          ...base,
          viewMode,
          showAiModels: false,
          showOrganization: false,
          gatesReady: false,
        }),
        "wait",
        viewMode,
      );
    }
  });

  it("sends a team view whose team is gone home", () => {
    assert.equal(
      deadViewStep({ ...base, viewMode: "team", activeTeamId: "team-gone" }),
      "go-home",
    );
  });

  it("waits out a dead team view while the teams read is in flight", () => {
    // TanStack answers `[]` on the first read, so with NO teams at all a dead
    // team view is indistinguishable from one about to resolve.
    assert.equal(
      deadViewStep({ ...base, viewMode: "team", teams: [] }),
      "wait",
    );
  });

  it("still sends a non-top-level view home with no teams", () => {
    // No teams read can ever make `chat` a screen, so this one is genuinely
    // stale, not in flight — and home with no teams is the Inbox.
    assert.equal(
      deadViewStep({ ...base, viewMode: "chat", teams: [] }),
      "go-home",
    );
  });
});

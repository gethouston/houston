import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newMissionTarget } from "../src/components/board/new-mission-target.ts";
import type { Agent } from "../src/lib/types.ts";

const agent = (id: string): Agent =>
  ({ id, name: id, folderPath: `houston:${id}` }) as Agent;

const [kai, marisol, ada] = [agent("kai"), agent("marisol"), agent("ada")];

/**
 * "New task" on a cross-agent board needs an owner, but asking is only honest
 * when there is a choice. Both silent cases are real bugs when they regress:
 * a pinned board that asks again has forgotten what it is showing, and a
 * one-agent team that asks is offering a list of one.
 */
describe("newMissionTarget", () => {
  it("goes straight to the PINNED agent, however many the team has", () => {
    assert.deepEqual(newMissionTarget(kai, [kai, marisol, ada]), {
      kind: "direct",
      agent: kai,
    });
  });

  it("goes straight to the only agent when the team holds one", () => {
    assert.deepEqual(newMissionTarget(null, [marisol]), {
      kind: "direct",
      agent: marisol,
    });
  });

  it("asks — with a MENU — on an unpinned board of several agents", () => {
    assert.deepEqual(newMissionTarget(null, [kai, marisol]), { kind: "menu" });
  });

  it("prefers the pin over the roster, even a roster of one", () => {
    // The pin is the more specific answer: a board narrowed to Ada is Ada's
    // board whatever else the team holds.
    assert.deepEqual(newMissionTarget(ada, [kai]), {
      kind: "direct",
      agent: ada,
    });
  });

  it("answers menu for an empty scope rather than inventing an owner", () => {
    // A board with no agents has no composer to open; its own empty state is
    // what the user sees, and the menu never gets a chance to render.
    assert.deepEqual(newMissionTarget(null, []), { kind: "menu" });
  });

  it("never answers direct without naming who", () => {
    for (const [pin, scope] of [
      [kai, [kai, marisol]],
      [null, [marisol]],
      [null, [kai, marisol]],
      [null, []],
    ] as const) {
      const target = newMissionTarget(pin, [...scope]);
      if (target.kind === "direct") assert.ok(target.agent.id);
    }
  });
});

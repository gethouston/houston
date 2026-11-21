import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  canUndoTeam,
  TEAM_CONVERSATION_START,
  teamAnswer,
  teamFinished,
  teamLines,
  teamUndo,
} from "../src/lib/manager-onboarding/team-script.ts";

const HIRED = {
  question: "teamBasic",
  value: "Avery, Jordan and Riley",
} as const;

const DONE = { question: "teamDone", value: "done" } as const;

const viaIndustry = () =>
  teamAnswer(
    { ...TEAM_CONVERSATION_START, view: { kind: "basicIndustry" } },
    { question: "teamIndustry", value: "legal" },
    { kind: "basic", viaIndustry: true },
  );

const resumedMore = () =>
  teamAnswer(
    TEAM_CONVERSATION_START,
    { question: "teamNext", value: "another" },
    TEAM_CONVERSATION_START.view,
  );

describe("team conversation", () => {
  it("opens straight on the starter team, with nothing asked", () => {
    deepStrictEqual(TEAM_CONVERSATION_START.view, {
      kind: "basic",
      viaIndustry: false,
    });
    deepStrictEqual(TEAM_CONVERSATION_START.entries, []);
    strictEqual(canUndoTeam(TEAM_CONVERSATION_START), false);
  });

  it("back from a starter team reached through its industry asks the industry", () => {
    const back = teamUndo(viaIndustry());
    deepStrictEqual(back.view, { kind: "basicIndustry" });
    deepStrictEqual(back.entries, []);
  });

  it("back from Hire one more on a resumed run returns to its choice", () => {
    const back = teamUndo(resumedMore());
    deepStrictEqual(back.view, TEAM_CONVERSATION_START.view);
    deepStrictEqual(back.entries, []);
  });

  it("hiring the team finishes it for good, closed by the hire", () => {
    const done = teamFinished(TEAM_CONVERSATION_START, HIRED);
    strictEqual(done.finished, true);
    strictEqual(canUndoTeam(done), false);
    strictEqual(teamUndo(done), done);
    strictEqual(done.entries.at(-1)?.locked, true);
    strictEqual(done.entries.at(-1)?.value, HIRED.value);
  });

  it("a finish with no closing answer adds none", () => {
    const done = teamFinished(TEAM_CONVERSATION_START, null);
    strictEqual(done.entries.length, 0);
    strictEqual(done.finished, true);
  });
});

describe("teamLines", () => {
  it("the latest answer is open to change until the team is hired", () => {
    const lines = teamLines(viaIndustry());
    deepStrictEqual(
      lines.map((line) => line.kind === "receipt" && line.editable),
      [true],
    );
  });

  it("the hire is the team's last line: the manager adds no welcome", () => {
    const lines = teamLines(teamFinished(viaIndustry(), HIRED));
    const last = lines.at(-1);
    strictEqual(last?.kind === "receipt" && last.value, HIRED.value);
    strictEqual(last?.kind === "receipt" && last.editable, false);
    for (const team of [
      teamFinished(viaIndustry(), HIRED),
      teamFinished(resumedMore(), DONE),
    ])
      strictEqual(
        teamLines(team).some((line) => line.kind === "manager"),
        false,
      );
  });

  it("keys stay unique across the whole team", () => {
    const keys = teamLines(teamFinished(viaIndustry(), HIRED)).map(
      (line) => line.key,
    );
    strictEqual(new Set(keys).size, keys.length);
  });
});

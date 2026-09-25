import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  basicTeamAnswered,
  basicTeamBrief,
  basicTeamDefaults,
} from "../src/components/onboarding/team/basic-team-model.ts";
import { hireCardRoleState } from "../src/components/onboarding/team/hire-card-model.ts";
import type { AgentRoleState } from "../src/components/shell/use-agent-role-state.ts";
import { AGENT_CONTEXT_IDS } from "../src/lib/agent-role-catalog.ts";

const [teamContext, otherContext] = AGENT_CONTEXT_IDS;

/** The hire flow's shared answers, recording every write made into them. */
function teamState(writes: string[]): AgentRoleState {
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      writes.push([name, ...args].join(":"));
    };
  return {
    contextId: teamContext,
    contextIsCustom: false,
    customContext: "",
    roleId: null,
    roleIsCustom: true,
    customRole: "Baker",
    contextLabel: "Bakery",
    roleLabel: "Baker",
    brief: { context: "Bakery", role: "Baker" },
    chooseContext: record("chooseContext"),
    chooseCustomContext: record("chooseCustomContext"),
    cancelCustomContext: record("cancelCustomContext"),
    writeCustomContext: record("writeCustomContext"),
    chooseRole: record("chooseRole"),
    chooseCustomRole: record("chooseCustomRole"),
    cancelCustomRole: record("cancelCustomRole"),
    writeCustomRole: record("writeCustomRole"),
    clearRole: record("clearRole"),
    answerBrief: record("answerBrief"),
  };
}

describe("the industry edited on a hire's naming card", () => {
  it("is that hire's alone: the team's industry is never written", () => {
    const writes: string[] = [];
    const card: (string | null)[] = [];
    const view = hireCardRoleState(teamState(writes), null, (industry) =>
      card.push(industry),
    );
    view.answerBrief("industry", "  Real   estate ");
    deepStrictEqual(writes, []);
    deepStrictEqual(card, ["Real estate"]);
  });

  it("is what the card shows and hires with, over the team's", () => {
    const view = hireCardRoleState(teamState([]), "Retail", () => {});
    strictEqual(view.contextLabel, "Retail");
    deepStrictEqual(view.brief, { context: "Retail", role: "Baker" });
  });

  it("follows the team's industry until the card is given its own", () => {
    const view = hireCardRoleState(teamState([]), null, () => {});
    strictEqual(view.contextLabel, "Bakery");
    deepStrictEqual(view.brief, { context: "Bakery", role: "Baker" });
  });

  it("takes no blank answer", () => {
    const card: (string | null)[] = [];
    const view = hireCardRoleState(teamState([]), null, (industry) =>
      card.push(industry),
    );
    view.answerBrief("industry", " ​ ");
    deepStrictEqual(card, []);
  });

  it("gives way to an answer in the industry step, which is the team's", () => {
    const writes: string[] = [];
    const card: (string | null)[] = [];
    const view = hireCardRoleState(teamState(writes), "Retail", (industry) =>
      card.push(industry),
    );
    view.chooseContext(otherContext);
    view.writeCustomContext("Dog grooming");
    deepStrictEqual(writes, [
      `chooseContext:${otherContext}`,
      "writeCustomContext:Dog grooming",
    ]);
    deepStrictEqual(card, [null, null]);
  });

  it("leaves the job to the hire's own answers", () => {
    const writes: string[] = [];
    const view = hireCardRoleState(teamState(writes), null, () => {});
    view.answerBrief("role", "Bookkeeper");
    deepStrictEqual(writes, ["answerBrief:role:Bookkeeper"]);
  });
});

describe("a basic team draft answered on its card", () => {
  const drafts = basicTeamDefaults((id) => id);

  it("changes that draft's industry and no other's", () => {
    const next = basicTeamAnswered(drafts, 1, "Bakery", "industry", "Retail");
    deepStrictEqual(
      next.map((draft) => basicTeamBrief(draft, "Bakery").context),
      ["Bakery", "Retail", "Bakery"],
    );
    // The others still follow the team: a new team industry reaches them.
    deepStrictEqual(
      next.map((draft) => basicTeamBrief(draft, "Freight").context),
      ["Freight", "Retail", "Freight"],
    );
  });

  it("changes that draft's job and no other's", () => {
    const next = basicTeamAnswered(drafts, 0, "Bakery", "role", "Researcher");
    deepStrictEqual(
      next.map((draft) => draft.roleLabel),
      ["Researcher", "operations_manager", "finance_manager"],
    );
  });

  it("leaves every draft as it was on a blank answer", () => {
    deepStrictEqual(
      basicTeamAnswered(drafts, 0, "Bakery", "industry", "  "),
      drafts,
    );
  });
});

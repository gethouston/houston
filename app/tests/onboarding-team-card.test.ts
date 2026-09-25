import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  BASIC_TEAM_ROLES,
  type BasicTeamDraft,
  basicTeamColors,
  basicTeamDefaults,
  basicTeamNameIssues,
  basicTeamSiblingNames,
  basicTeamSubmit,
  hasBasicTeamWork,
} from "../src/components/onboarding/team/basic-team-model.ts";
import {
  capIndustryLabel,
  surveyRoleStart,
} from "../src/components/onboarding/team/team-industry.ts";
import {
  nextTeamView,
  previousTeamView,
  startBasic,
  startHire,
  TEAM_CHOICE,
  type TeamView,
  teamFunnelStep,
  teamViewKey,
} from "../src/components/onboarding/team/team-view-model.ts";
import { AGENT_COMMON_ROLES } from "../src/lib/agent-role-catalog-data.ts";
import { AGENT_ROLE_PART_MAX_LENGTH } from "../src/lib/agent-role-context.ts";
import { nextFreeAgentColor } from "../src/lib/next-agent-color.ts";

const LABELS: Record<string, string> = {
  executive_assistant: "Executive assistant",
  operations_manager: "Operations manager",
  finance_manager: "Finance manager",
};
const defaults = () => basicTeamDefaults((id) => LABELS[id]);
const fresh = { hasIndustry: true, hiredCount: 0 };

describe("team card walk", () => {
  it("walks a hire through its three questions to the roster", () => {
    let view: TeamView = startHire();
    deepStrictEqual(view, { kind: "hire", step: "context" });
    view = nextTeamView(view);
    deepStrictEqual(view, { kind: "hire", step: "role" });
    view = nextTeamView(view);
    deepStrictEqual(view, { kind: "hire", step: "customize" });
    deepStrictEqual(nextTeamView(view), { kind: "hired" });
  });

  it("backs out of a hire one question at a time, to the choice", () => {
    deepStrictEqual(
      previousTeamView({ kind: "hire", step: "customize" }, fresh),
      { kind: "hire", step: "role" },
    );
    deepStrictEqual(previousTeamView({ kind: "hire", step: "role" }, fresh), {
      kind: "hire",
      step: "context",
    });
    deepStrictEqual(
      previousTeamView({ kind: "hire", step: "context" }, fresh),
      TEAM_CHOICE,
    );
  });

  it("backs out of 'Hire another' to the roster", () => {
    deepStrictEqual(
      previousTeamView(
        { kind: "hire", step: "context" },
        { hasIndustry: true, hiredCount: 2 },
      ),
      { kind: "hired" },
    );
  });

  it("offers no Back on the choice, and leads the roster back to it", () => {
    strictEqual(previousTeamView(TEAM_CHOICE, fresh), null);
    // The choice holds the basic team, so switching paths is one Back away.
    deepStrictEqual(
      previousTeamView({ kind: "hired" }, { hasIndustry: true, hiredCount: 2 }),
      TEAM_CHOICE,
    );
  });

  it("asks for the industry before the basic team only when there is none", () => {
    deepStrictEqual(startBasic(fresh), { kind: "basic", viaIndustry: false });
    const noIndustry = { hasIndustry: false, hiredCount: 0 };
    const asked = startBasic(noIndustry);
    deepStrictEqual(asked, { kind: "basicIndustry" });
    const team = nextTeamView(asked);
    deepStrictEqual(team, { kind: "basic", viaIndustry: true });
    // Picked here, the industry stays changeable from the team screen.
    deepStrictEqual(previousTeamView(team, fresh), { kind: "basicIndustry" });
    deepStrictEqual(
      previousTeamView({ kind: "basic", viaIndustry: false }, fresh),
      TEAM_CHOICE,
    );
    deepStrictEqual(previousTeamView(asked, noIndustry), TEAM_CHOICE);
  });

  it("names each screen apart and maps it to its funnel step", () => {
    strictEqual(teamViewKey({ kind: "hire", step: "role" }), "hire-role");
    strictEqual(teamViewKey({ kind: "basic", viaIndustry: true }), "basic");
    strictEqual(teamFunnelStep(TEAM_CHOICE), null);
    strictEqual(teamFunnelStep(startHire()), "teamHire");
    strictEqual(teamFunnelStep({ kind: "hired" }), "teamHire");
    strictEqual(teamFunnelStep({ kind: "basicIndustry" }), "teamBasic");
    strictEqual(
      teamFunnelStep({ kind: "basic", viaIndustry: false }),
      "teamBasic",
    );
  });
});

describe("basic team", () => {
  const named = (names: readonly string[]): BasicTeamDraft[] =>
    defaults().map((draft, at) => ({ ...draft, name: names[at] ?? "" }));

  it("is the three shared roles, each still to be named", () => {
    deepStrictEqual(
      [...BASIC_TEAM_ROLES],
      ["executive_assistant", "operations_manager", "finance_manager"],
    );
    for (const id of BASIC_TEAM_ROLES) {
      strictEqual((AGENT_COMMON_ROLES as readonly string[]).includes(id), true);
    }
    deepStrictEqual(
      defaults().map((draft) => draft.name),
      ["", "", ""],
    );
  });

  it("requires every name, so an untouched team is held back", () => {
    deepStrictEqual(basicTeamNameIssues(defaults(), []), [
      "required",
      "required",
      "required",
    ]);
    const blank = named(["Ava", "   ", "Leo"]);
    deepStrictEqual(basicTeamNameIssues(blank, []), [null, "required", null]);
  });

  it("points the submit at the first card whose name holds it back", () => {
    deepStrictEqual(basicTeamSubmit(defaults(), [], 0), {
      kind: "invalid",
      index: 0,
    });
    deepStrictEqual(basicTeamSubmit(named(["Ava", "", ""]), [], 0), {
      kind: "invalid",
      index: 1,
    });
    deepStrictEqual(basicTeamSubmit(named(["Ava", "Leo", "Iris"]), [], 0), {
      kind: "hire",
    });
  });

  it("flags a taken name, and two cards sharing one", () => {
    const rows = named(["Ava", "Pax", "pax"]);
    deepStrictEqual(basicTeamNameIssues(rows, []), [null, "taken", "taken"]);
    deepStrictEqual(
      basicTeamNameIssues(named(["Ava", "Leo", "Iris"]), ["ava"]),
      ["taken", null, null],
    );
    deepStrictEqual(
      basicTeamSubmit(named(["Ava", "Leo", "Iris"]), ["IRIS"], 0),
      { kind: "invalid", index: 2 },
    );
  });

  it("flags a name the host would refuse for its characters", () => {
    strictEqual(basicTeamNameIssues(named(["a/b"]), [])[0], "invalidChars");
  });

  it("counts only the other drafts still to hire as siblings", () => {
    const rows = named(["Ava", " Leo ", ""]);
    deepStrictEqual(basicTeamSiblingNames(rows, 0), ["Leo"]);
    rows[1] = { ...rows[1], rosterKey: "hire-1" };
    deepStrictEqual(basicTeamSiblingNames(rows, 0), []);
  });

  it("never re-checks a starter on the roster, and offers only what is left", () => {
    const rows = named(["Ava", "Leo", "Iris"]).map((m, i) =>
      i === 0 ? { ...m, rosterKey: "hire-1" } : m,
    );
    // The joined starter's own name is now one of the taken ones.
    deepStrictEqual(basicTeamNameIssues(rows, ["Ava"]), [null, null, null]);
    strictEqual(hasBasicTeamWork(rows, 0), true);
    const joined = rows.map((m, i) => ({ ...m, rosterKey: `hire-${i}` }));
    strictEqual(hasBasicTeamWork(joined, 0), false);
    deepStrictEqual(basicTeamSubmit(joined, [], 0), { kind: "idle" });
    // A starter whose create failed is worth pressing again for.
    strictEqual(hasBasicTeamWork(joined, 1), true);
    deepStrictEqual(basicTeamSubmit(joined, [], 1), { kind: "hire" });
  });
});

describe("basic team colors", () => {
  const deal = (dealt: readonly string[]) => nextFreeAgentColor(dealt);

  it("deals every starter a distinct default", () => {
    const colors = basicTeamColors(defaults(), deal);
    strictEqual(new Set(colors).size, 3);
  });

  it("never changes another card when one card picks its color", () => {
    const drafts = defaults();
    const before = basicTeamColors(drafts, deal);
    // The first card takes the second card's default, then the third's.
    for (const picked of [before[1], before[2]]) {
      drafts[0] = { ...drafts[0], color: picked };
      const after = basicTeamColors(drafts, deal);
      strictEqual(after[0], picked);
      deepStrictEqual(after.slice(1), before.slice(1));
    }
  });

  it("lets two cards wear the same color when the person picks it", () => {
    const drafts = defaults();
    drafts[2] = { ...drafts[2], color: "navy" };
    drafts[1] = { ...drafts[1], color: "navy" };
    const colors = basicTeamColors(drafts, deal);
    strictEqual(colors[1], "navy");
    strictEqual(colors[2], "navy");
  });
});

describe("survey industry as the hire's opening answer", () => {
  it("preselects a catalog industry", () => {
    deepStrictEqual(
      surveyRoleStart({ contextId: "real_estate", customLabel: null }),
      { contextId: "real_estate", customContext: "" },
    );
  });

  it("opens blank when the survey has no industry", () => {
    deepStrictEqual(surveyRoleStart({ contextId: null, customLabel: null }), {
      contextId: null,
      customContext: "",
    });
  });

  it("carries the person's own words, cut to fit", () => {
    const words = `${"Wholesale distribution of construction ".repeat(4)}materials`;
    const start = surveyRoleStart({ contextId: null, customLabel: words });
    strictEqual(start.contextId, null);
    strictEqual(start.customContext, capIndustryLabel(words));
  });
});

describe("capIndustryLabel", () => {
  it("keeps a label that fits, tidied", () => {
    const zeroWidthSpace = String.fromCodePoint(0x200b);
    strictEqual(
      capIndustryLabel(`  Dog   grooming${zeroWidthSpace} `),
      "Dog grooming",
    );
  });

  it("cuts on the last whole word that fits", () => {
    const label =
      "Wholesale distribution of construction materials across the southern region";
    const cut = capIndustryLabel(label);
    strictEqual(
      cut,
      "Wholesale distribution of construction materials across the",
    );
    strictEqual([...cut].length <= AGENT_ROLE_PART_MAX_LENGTH, true);
  });

  it("keeps a word the cap lands right after", () => {
    strictEqual(capIndustryLabel("abcd efgh ijkl", 9), "abcd efgh");
  });

  it("drops a separator left dangling by the cut", () => {
    strictEqual(capIndustryLabel("Bakery, cafe, catering", 13), "Bakery, cafe");
    strictEqual(capIndustryLabel("Bakery & cafe", 9), "Bakery");
  });

  it("cuts inside a single word longer than the cap", () => {
    strictEqual(capIndustryLabel("x".repeat(80)), "x".repeat(64));
  });

  it("counts code points, so an emoji is never split", () => {
    const cut = capIndustryLabel("🍕".repeat(70));
    strictEqual([...cut].length, AGENT_ROLE_PART_MAX_LENGTH);
  });
});

import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  basicTeamAdd,
  basicTeamRecolor,
  basicTeamRemovable,
  basicTeamRemove,
} from "../src/components/onboarding/team/basic-team-edit.ts";
import {
  BASIC_TEAM_ROLES,
  type BasicTeamDraft,
  basicTeamColors,
  basicTeamDefaults,
  basicTeamRoleIds,
  basicTeamSubmit,
  hasBasicTeamWork,
} from "../src/components/onboarding/team/basic-team-model.ts";
import {
  basicTeamNameIssues,
  basicTeamNames,
} from "../src/components/onboarding/team/basic-team-names.ts";
import {
  capAnswerLabel,
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
import {
  AGENT_CONTEXT_IDS,
  rolesForContext,
} from "../src/lib/agent-role-catalog.ts";
import { AGENT_COMMON_ROLES } from "../src/lib/agent-role-catalog-data.ts";
import { AGENT_ROLE_PART_MAX_LENGTH } from "../src/lib/agent-role-context.ts";
import { nextFreeAgentColor } from "../src/lib/next-agent-color.ts";

const LABELS: Record<string, string> = {
  executive_assistant: "Executive assistant",
  operations_manager: "Operations manager",
  finance_manager: "Finance manager",
};
const label = (id: string) => LABELS[id] ?? id;
const defaults = () => basicTeamDefaults(label);
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

  it("uses the shared fallback for an unknown or custom industry", () => {
    deepStrictEqual(
      [...BASIC_TEAM_ROLES],
      ["executive_assistant", "operations_manager", "finance_manager"],
    );
    for (const id of BASIC_TEAM_ROLES) {
      strictEqual((AGENT_COMMON_ROLES as readonly string[]).includes(id), true);
    }
    deepStrictEqual(
      defaults().map((draft) => draft.name),
      [null, null, null],
    );
    deepStrictEqual(basicTeamNames(defaults(), []), [
      "Executive assistant",
      "Operations manager",
      "Finance manager",
    ]);
  });

  it("leads with the first two jobs the industry's role question offers", () => {
    deepStrictEqual(basicTeamRoleIds("real_estate"), [
      "executive_assistant",
      "listing_agent",
      "buyer_agent",
    ]);
    deepStrictEqual(
      basicTeamDefaults(label, "real_estate").map((draft) => draft.roleId),
      basicTeamRoleIds("real_estate"),
    );
    for (const id of AGENT_CONTEXT_IDS) {
      const chosen = basicTeamRoleIds(id);
      deepStrictEqual(chosen.slice(1), rolesForContext(id).own.slice(0, 2));
      strictEqual(new Set(chosen).size, 3);
    }
    deepStrictEqual(basicTeamRoleIds(null), [...BASIC_TEAM_ROLES]);
  });

  it("hires an untouched team as it stands", () => {
    deepStrictEqual(basicTeamNameIssues(defaults(), []), [null, null, null]);
    deepStrictEqual(basicTeamSubmit(defaults(), [], 0), { kind: "hire" });
  });

  it("numbers a job name taken in the workspace, on a card, or dealt before", () => {
    deepStrictEqual(basicTeamNames(defaults(), ["executive ASSISTANT"]), [
      "Executive assistant 2",
      "Operations manager",
      "Finance manager",
    ]);
    const typed = defaults().map((draft, at) =>
      at === 2 ? { ...draft, name: " Operations manager " } : draft,
    );
    deepStrictEqual(basicTeamNames(typed, []), [
      "Executive assistant",
      "Operations manager 2",
      " Operations manager ",
    ]);
    const sameJob = defaults().map((draft) => ({
      ...draft,
      roleLabel: "Bookkeeper",
    }));
    deepStrictEqual(basicTeamNames(sameJob, []), [
      "Bookkeeper",
      "Bookkeeper 2",
      "Bookkeeper 3",
    ]);
    deepStrictEqual(basicTeamNameIssues(sameJob, []), [null, null, null]);
  });

  it("follows a new job until the person types a name", () => {
    const [moved] = defaults().map((draft) => ({
      ...draft,
      roleLabel: "Researcher",
    }));
    deepStrictEqual(basicTeamNames([moved], []), ["Researcher"]);
    deepStrictEqual(basicTeamNames([{ ...moved, name: "Ava" }], []), ["Ava"]);
  });

  it("requires every name, so a name cleared to blank holds the team back", () => {
    const blank = named(["Ava", "   ", "Leo"]);
    deepStrictEqual(basicTeamNameIssues(blank, []), [null, "required", null]);
  });

  it("points the submit at the first card whose name holds it back", () => {
    deepStrictEqual(basicTeamSubmit(named(["", "Leo", ""]), [], 0), {
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
    const rows = named(["Ava", " ava ", "Leo"]);
    deepStrictEqual(basicTeamNameIssues(rows, []), ["taken", "taken", null]);
    rows[1] = { ...rows[1], rosterKey: "hire-1" };
    deepStrictEqual(basicTeamNameIssues(rows, []), [null, null, null]);
  });

  it("never re-checks a starter on the roster, and offers only what is left", () => {
    const rows = named(["Ava", "Leo", "Iris"]).map((m, i) =>
      i === 0 ? { ...m, rosterKey: "hire-1" } : m,
    );
    deepStrictEqual(basicTeamNameIssues(rows, ["Ava"]), [null, null, null]);
    strictEqual(hasBasicTeamWork(rows, 0), true);
    const joined = rows.map((m, i) => ({ ...m, rosterKey: `hire-${i}` }));
    strictEqual(hasBasicTeamWork(joined, 0), false);
    deepStrictEqual(basicTeamSubmit(joined, [], 0), { kind: "idle" });
    strictEqual(hasBasicTeamWork(joined, 1), true);
    deepStrictEqual(basicTeamSubmit(joined, [], 1), { kind: "hire" });
  });
});

describe("growing and trimming the basic team", () => {
  const PALETTE = ["navy", "forest", "crimson", "golden", "teal", "rose"];
  const next = (taken: readonly string[]) =>
    PALETTE.find((color) => !taken.includes(color)) ?? PALETTE[0];
  const shown = (drafts: readonly BasicTeamDraft[]) =>
    basicTeamColors(drafts, next);
  const add = (drafts: readonly BasicTeamDraft[]) =>
    basicTeamAdd(drafts, label, shown(drafts), next);

  it("Hire one more puts the first shared job no card began as on top", () => {
    const grown = add(defaults());
    strictEqual(grown.length, 4);
    const added = grown[0];
    const expected = AGENT_COMMON_ROLES.find(
      (id) => !(BASIC_TEAM_ROLES as readonly string[]).includes(id),
    );
    strictEqual(added.roleId, expected);
    strictEqual(added.roleLabel, label(added.roleId));
    strictEqual(added.rosterKey, null);
    strictEqual(added.name, null);
    deepStrictEqual(
      grown.slice(1).map((draft) => draft.roleId),
      [...BASIC_TEAM_ROLES],
    );
  });

  it("no card changes color when one arrives on top, and the new one takes a free color", () => {
    const team = defaults();
    const before = shown(team);
    const grown = add(team);
    const after = shown(grown);
    deepStrictEqual(after.slice(1), before);
    strictEqual(before.includes(after[0]), false);
  });

  it("no card changes color when another is let go", () => {
    const team = defaults();
    const before = shown(team);
    const trimmed = basicTeamRemove(team, 0, before);
    deepStrictEqual(shown(trimmed), before.slice(1));
  });

  it("every card keeps a key of its own, even once the shared jobs run out", () => {
    let drafts = defaults();
    for (let n = 0; n < AGENT_COMMON_ROLES.length + 2; n++)
      drafts = add(drafts);
    const keys = drafts.map((draft) => draft.key);
    strictEqual(new Set(keys).size, keys.length);
  });

  it("a draft can be let go while another card stands", () => {
    const team = defaults();
    strictEqual(basicTeamRemovable(team, 1), true);
    const trimmed = basicTeamRemove(team, 1, shown(team));
    deepStrictEqual(
      trimmed.map((draft) => draft.roleId),
      ["executive_assistant", "finance_manager"],
    );
  });

  it("the last card, and a card already hired, stay", () => {
    let one = defaults();
    while (one.length > 1) one = basicTeamRemove(one, 0, shown(one));
    strictEqual(basicTeamRemovable(one, 0), false);
    deepStrictEqual(basicTeamRemove(one, 0, shown(one)), one);
    const hired = defaults().map((draft, at) =>
      at === 0 ? { ...draft, rosterKey: "member-1" } : draft,
    );
    strictEqual(basicTeamRemovable(hired, 0), false);
    strictEqual(basicTeamRemove(hired, 0, shown(hired)).length, 3);
  });

  it("a card added after one was let go never reuses its key", () => {
    const grown = add(defaults());
    const regrown = add(basicTeamRemove(grown, 0, shown(grown)));
    const keys = regrown.map((draft) => draft.key);
    strictEqual(new Set(keys).size, keys.length);
  });
});

describe("basic team colors", () => {
  const deal = (dealt: readonly string[]) => nextFreeAgentColor(dealt);

  it("deals every starter a distinct default", () => {
    const colors = basicTeamColors(defaults(), deal);
    strictEqual(new Set(colors).size, 3);
  });

  it("swaps two cards when one picks a color already worn", () => {
    const drafts = defaults();
    const before = basicTeamColors(drafts, deal);
    const swapped = basicTeamRecolor(drafts, 0, before[1], before);
    deepStrictEqual(basicTeamColors(swapped, deal), [
      before[1],
      before[0],
      before[2],
    ]);
    const again = basicTeamRecolor(
      swapped,
      0,
      before[2],
      basicTeamColors(swapped, deal),
    );
    deepStrictEqual(basicTeamColors(again, deal), [
      before[2],
      before[0],
      before[1],
    ]);
  });

  it("keeps the other cards' colors when the picked color is free", () => {
    const before = basicTeamColors(defaults(), deal);
    const recolored = basicTeamRecolor(defaults(), 1, "charcoal", before);
    deepStrictEqual(basicTeamColors(recolored, deal), [
      before[0],
      "charcoal",
      before[2],
    ]);
  });

  it("swaps a draft with a teammate already on the roster", () => {
    const before = basicTeamColors(defaults(), deal);
    const drafts = defaults().map((draft, at) =>
      at === 1 ? { ...draft, rosterKey: "hire-1" } : draft,
    );
    const swapped = basicTeamRecolor(drafts, 0, before[1], before);
    strictEqual(swapped[1].rosterKey, "hire-1");
    deepStrictEqual(basicTeamColors(swapped, deal), [
      before[1],
      before[0],
      before[2],
    ]);
  });
});

describe("the survey's answers as the hire's opening answers", () => {
  const NO_ROLE = { roleId: null, customLabel: null };
  it("preselects a catalog industry and role", () => {
    deepStrictEqual(
      surveyRoleStart(
        { contextId: "real_estate", customLabel: null },
        { roleId: "mls_listing_coordinator", customLabel: null },
      ),
      {
        contextId: "real_estate",
        customContext: "",
        roleId: "mls_listing_coordinator",
        customRole: "",
      },
    );
  });

  it("opens blank when the survey has no industry and no role", () => {
    deepStrictEqual(
      surveyRoleStart({ contextId: null, customLabel: null }, NO_ROLE),
      { contextId: null, customContext: "", roleId: null, customRole: "" },
    );
    deepStrictEqual(
      surveyRoleStart({ contextId: null, customLabel: null }),
      surveyRoleStart({ contextId: null, customLabel: null }, NO_ROLE),
    );
  });

  it("carries the person's own words, cut to fit", () => {
    const words = `${"Wholesale distribution of construction ".repeat(4)}materials`;
    const start = surveyRoleStart(
      { contextId: null, customLabel: words },
      { roleId: null, customLabel: words },
    );
    strictEqual(start.contextId, null);
    strictEqual(start.customContext, capAnswerLabel(words));
    strictEqual(start.roleId, null);
    strictEqual(start.customRole, capAnswerLabel(words));
  });
});

describe("capAnswerLabel", () => {
  it("keeps a label that fits, tidied", () => {
    const zeroWidthSpace = String.fromCodePoint(0x200b);
    strictEqual(
      capAnswerLabel(`  Dog   grooming${zeroWidthSpace} `),
      "Dog grooming",
    );
  });

  it("cuts on the last whole word that fits", () => {
    const label =
      "Wholesale distribution of construction materials across the southern region";
    const cut = capAnswerLabel(label);
    strictEqual(
      cut,
      "Wholesale distribution of construction materials across the",
    );
    strictEqual([...cut].length <= AGENT_ROLE_PART_MAX_LENGTH, true);
  });

  it("keeps a word the cap lands right after", () => {
    strictEqual(capAnswerLabel("abcd efgh ijkl", 9), "abcd efgh");
  });

  it("drops a separator left dangling by the cut", () => {
    strictEqual(capAnswerLabel("Bakery, cafe, catering", 13), "Bakery, cafe");
    strictEqual(capAnswerLabel("Bakery & cafe", 9), "Bakery");
  });

  it("cuts inside a single word longer than the cap", () => {
    strictEqual(capAnswerLabel("x".repeat(80)), "x".repeat(64));
  });

  it("counts code points, so an emoji is never split", () => {
    const cut = capAnswerLabel("🍕".repeat(70));
    strictEqual([...cut].length, AGENT_ROLE_PART_MAX_LENGTH);
  });
});

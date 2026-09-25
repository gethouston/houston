import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { parseJobDescription } from "@houston/sdk/job-description";
import {
  briefWithAnswer,
  jobAnswerEntry,
} from "../src/components/context/job-brief-model.ts";
import {
  basicTeamAnswered,
  basicTeamBrief,
  basicTeamDefaults,
} from "../src/components/onboarding/team/basic-team-model.ts";
import {
  rosterBriefPatch,
  rosterEdit,
  rosterRevert,
  rosterSaved,
  rosterUnsaved,
} from "../src/components/onboarding/team/team-roster-edit.ts";
import {
  type RosterMember,
  rosterJoin,
  rosterRetry,
  rosterSettle,
} from "../src/components/onboarding/team/team-roster-model.ts";
import { withAgentRoleContext } from "../src/lib/agent-role-context.ts";

const brief = { context: "Bakery", role: "Executive assistant" };
const only = (members: readonly RosterMember[]) => members[0];
const joined = () =>
  rosterJoin([], { key: "hire-1", name: "Pax", color: "navy", brief });
const hired = () =>
  rosterSettle(joined(), "hire-1", { kind: "hired", id: "pax", name: "Pax" });

describe("answering a card's job or industry again", () => {
  it("changes that fact and keeps the other: any job pairs with any industry", () => {
    deepStrictEqual(briefWithAnswer(brief, "industry", "  Real   estate "), {
      context: "Real estate",
      role: "Executive assistant",
    });
    deepStrictEqual(briefWithAnswer(brief, "role", "Bookkeeper"), {
      context: "Bakery",
      role: "Bookkeeper",
    });
  });

  it("takes no blank answer, since a brief needs both facts", () => {
    strictEqual(briefWithAnswer(brief, "role", " ​ "), null);
  });

  it("opens the question on the chip an answer came from, else the words", () => {
    const labels = { freight: "Freight", retail: "Retail" } as const;
    const ids = ["freight", "retail"] as const;
    const label = (id: (typeof ids)[number]) => labels[id];
    deepStrictEqual(jobAnswerEntry(ids, label, "retail"), {
      id: "retail",
      typed: "",
    });
    deepStrictEqual(jobAnswerEntry(ids, label, "Dog grooming"), {
      id: null,
      typed: "Dog grooming",
    });
    // Typed words carry the answer's own cap, wherever they came from.
    strictEqual(jobAnswerEntry(ids, label, "a".repeat(200)).typed.length, 64);
  });
});

describe("a basic team draft's brief", () => {
  const drafts = basicTeamDefaults((id) =>
    id === "executive_assistant" ? "EA" : id,
  );

  it("follows the team's industry until the card is given its own", () => {
    deepStrictEqual(basicTeamBrief(drafts[0], "Bakery"), {
      context: "Bakery",
      role: "EA",
    });
    const [moved] = basicTeamAnswered(
      drafts,
      0,
      "Bakery",
      "industry",
      "Retail",
    );
    strictEqual(moved.industry, "Retail");
    deepStrictEqual(basicTeamBrief(moved, "Bakery"), {
      context: "Retail",
      role: "EA",
    });
  });

  it("takes a new job and keeps the card's place in the team", () => {
    const [moved] = basicTeamAnswered(
      drafts,
      0,
      "Bakery",
      "role",
      "Researcher",
    );
    strictEqual(moved.roleLabel, "Researcher");
    strictEqual(moved.roleId, "executive_assistant");
    const [blank] = basicTeamAnswered(drafts, 0, "Bakery", "role", "  ");
    strictEqual(blank, drafts[0]);
  });
});

describe("a hire's brief edited on the roster", () => {
  it("is a patch only when it changes something", () => {
    const member = only(hired());
    deepStrictEqual(rosterBriefPatch(member, "role", "Bookkeeper"), {
      brief: { context: "Bakery", role: "Bookkeeper" },
    });
    strictEqual(rosterBriefPatch(member, "industry", "Bakery"), null);
    strictEqual(rosterBriefPatch(member, "industry", ""), null);
  });

  it("is saved once a joining hire lands, like a rename", () => {
    const next = { context: "Retail", role: "Executive assistant" };
    const edited = rosterEdit(joined(), "hire-1", { brief: next });
    strictEqual(rosterUnsaved(only(edited)), null);
    const landed = only(
      rosterSettle(edited, "hire-1", { kind: "hired", id: "pax", name: "Pax" }),
    );
    deepStrictEqual(rosterUnsaved(landed), { brief: next });
  });

  it("becomes what the host holds once saved, and reverts when refused", () => {
    const next = { context: "Bakery", role: "Bookkeeper" };
    const edited = rosterEdit(hired(), "hire-1", { brief: next });
    const sent = rosterUnsaved(only(edited)) ?? {};
    const saved = only(rosterSaved(edited, "hire-1", sent, { id: "pax" }));
    deepStrictEqual(saved.saved.brief, next);
    strictEqual(rosterUnsaved(saved), null);
    const reverted = only(rosterRevert(edited, "hire-1", sent));
    deepStrictEqual(reverted.brief, brief);
  });

  it("rides into a failed hire's retry", () => {
    const failed = rosterSettle(joined(), "hire-1", {
      kind: "failed",
      reason: "failed",
    });
    const next = { context: "Retail", role: "Buyer" };
    const retried = rosterRetry(
      rosterEdit(failed, "hire-1", { brief: next }),
      "hire-1",
      [],
    );
    deepStrictEqual(retried?.retried.brief, next);
    deepStrictEqual(retried?.retried.saved.brief, next);
  });
});

describe("writing a new brief into a job description", () => {
  it("rewrites the block the create wrote and nothing else", () => {
    const file = `---
industry: Bakery
role: Executive assistant
tone: warm
---

I keep the owner's calendar.
`;
    const next = withAgentRoleContext(file, {
      context: "Retail",
      role: "Bookkeeper",
    });
    deepStrictEqual(parseJobDescription(next), {
      fields: { industry: "Retail", role: "Bookkeeper" },
      body: "I keep the owner's calendar.",
      extraKeys: { tone: "warm" },
    });
  });

  it("gives a file with no block one, prose untouched", () => {
    const prose = "# Pax\n\nI answer the phones.\n";
    const next = withAgentRoleContext(prose, brief);
    deepStrictEqual(parseJobDescription(next).fields, {
      industry: "Bakery",
      role: "Executive assistant",
    });
    strictEqual(parseJobDescription(next).body, prose.trimEnd());
  });
});

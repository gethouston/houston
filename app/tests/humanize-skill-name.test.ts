import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  humanizeSkillName,
  skillTitleOfSlug,
} from "../src/lib/humanize-skill-name.ts";

describe("humanizeSkillName", () => {
  it("humanizes a kebab/underscore slug for display", () => {
    strictEqual(
      humanizeSkillName("redactar-outreach-esg"),
      "Redactar outreach esg",
    );
    strictEqual(humanizeSkillName("summarize_inbox"), "Summarize inbox");
  });

  it("never throws on a missing identity (the App-crash guard)", () => {
    // A display helper must degrade, not white-screen the app, when a skill
    // name comes back undefined/empty (see SkillDetailPage crash).
    const missing = undefined as unknown as string;
    strictEqual(humanizeSkillName(missing), "");
    strictEqual(humanizeSkillName(""), "");
  });
});

describe("skillTitleOfSlug", () => {
  const LOADED = [
    { name: "redactar-outreach-esg", title: "Redactar outreach ESG" },
    { name: "summarize_inbox", title: null },
  ];

  it("prefers the skill's own frontmatter title", () => {
    strictEqual(
      skillTitleOfSlug("redactar-outreach-esg", LOADED),
      "Redactar outreach ESG",
    );
  });

  it("humanizes the slug when the skill carries no title", () => {
    strictEqual(skillTitleOfSlug("summarize_inbox", LOADED), "Summarize inbox");
  });

  it("humanizes the slug while the skills list is unread", () => {
    strictEqual(
      skillTitleOfSlug("redactar-outreach-esg", undefined),
      "Redactar outreach esg",
    );
    strictEqual(skillTitleOfSlug("meeting-prep", LOADED), "Meeting prep");
  });
});

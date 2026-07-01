import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { humanizeSkillName } from "../src/lib/humanize-skill-name.ts";

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

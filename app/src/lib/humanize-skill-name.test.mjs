import assert from "node:assert/strict";
import test from "node:test";
import { humanizeSkillName } from "./humanize-skill-name.ts";

test("humanizes action slugs for user-facing cards", () => {
  assert.equal(humanizeSkillName("research-company"), "Research company");
  assert.equal(humanizeSkillName("draft_an_nda"), "Draft an nda");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { withSkillTitle } from "../src/lib/skill-title.ts";

const SKILL = `---
name: create-an-loi
description: Draft a Letter of Intent for a new customer or partner.
version: 1
category: contracts
featured: yes
---

## Procedure
Do the thing.
`;

test("replaces an existing title line in place", () => {
  const input = SKILL.replace(
    "description:",
    'title: "Old name"\ndescription:',
  );
  const out = withSkillTitle(input, "Create an LOI");
  assert.match(out, /^title: "Create an LOI"$/m);
  assert.doesNotMatch(out, /Old name/);
  // Everything else survives byte-for-byte.
  assert.match(out, /^name: create-an-loi$/m);
  assert.match(out, /^featured: yes$/m);
  assert.ok(out.endsWith("## Procedure\nDo the thing.\n"));
});

test("inserts the title right after name when absent", () => {
  const out = withSkillTitle(SKILL, "Create an LOI");
  assert.match(
    out,
    /^---\nname: create-an-loi\ntitle: "Create an LOI"\ndescription:/,
  );
});

test("appends to the frontmatter when there is no name key", () => {
  const out = withSkillTitle("---\ndescription: x\n---\nbody\n", "Titled");
  assert.equal(out, '---\ndescription: x\ntitle: "Titled"\n---\nbody\n');
});

test("creates frontmatter when the file has none", () => {
  const out = withSkillTitle("## Procedure\n", "Titled");
  assert.equal(out, '---\ntitle: "Titled"\n---\n\n## Procedure\n');
});

test("collapses a block-scalar title's continuation lines", () => {
  const input =
    "---\nname: x\ntitle: >-\n  Old\n  name\ncategory: a\n---\nbody";
  const out = withSkillTitle(input, "New");
  assert.equal(out, '---\nname: x\ntitle: "New"\ncategory: a\n---\nbody');
});

test("trims and safely quotes special characters", () => {
  const out = withSkillTitle(SKILL, '  Facturación: "rápida" \\ fácil  ');
  assert.match(out, /^title: "Facturación: \\"rápida\\" \\\\ fácil"$/m);
});

test("tolerates CRLF frontmatter", () => {
  const input = "---\r\nname: x\r\ntitle: Old\r\n---\r\nbody";
  const out = withSkillTitle(input, "New");
  assert.equal(out, '---\nname: x\ntitle: "New"\n---\nbody');
});

test("renaming twice keeps exactly one title line", () => {
  const out = withSkillTitle(withSkillTitle(SKILL, "First"), "Second");
  assert.equal(out.match(/^title:/gm)?.length, 1);
  assert.match(out, /^title: "Second"$/m);
});

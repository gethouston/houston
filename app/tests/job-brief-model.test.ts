import assert from "node:assert/strict";
import test from "node:test";
import { parseJobDescription } from "@houston/sdk/job-description";
import {
  choiceIdForLabel,
  withJobBody,
  withJobField,
} from "../src/components/context/job-brief-model.ts";

const FILE = `---
industry: Healthcare
role: Medical coder
---

I chase the claims that come back rejected.
`;

test("the tab's two rows and its editor all come from the one file", () => {
  const view = parseJobDescription(FILE);
  assert.equal(view.fields.industry, "Healthcare");
  assert.equal(view.fields.role, "Medical coder");
  // The editor binds to the description ALONE: the block is drawn as controls
  // above it, and showing it twice would let the user edit it two ways.
  assert.equal(view.body, "I chase the claims that come back rejected.");
});

test("picking a new role rewrites that fact and nothing else", () => {
  const next = withJobField(FILE, "role", "Billing specialist");
  assert.deepEqual(parseJobDescription(next), {
    fields: { industry: "Healthcare", role: "Billing specialist" },
    body: "I chase the claims that come back rejected.",
    extraKeys: {},
  });
});

test("saving the description keeps the facts above it", () => {
  const next = withJobBody(FILE, "New words entirely.\n");
  assert.deepEqual(parseJobDescription(next), {
    fields: { industry: "Healthcare", role: "Medical coder" },
    body: "New words entirely.",
    extraKeys: {},
  });
});

test("an agent with no block gains one on the first pick, prose untouched", () => {
  const prose = "# Jerry\n\nI answer the phones.\n";
  const view = parseJobDescription(prose);
  assert.equal(view.fields.industry, null);
  assert.equal(view.fields.role, null);
  assert.equal(view.body, prose.trimEnd());

  const next = withJobField(prose, "industry", "Hospitality");
  assert.equal(next, `---\nindustry: Hospitality\n---\n\n${prose}`);
  assert.deepEqual(parseJobDescription(next), {
    fields: { industry: "Hospitality", role: null },
    body: prose.trimEnd(),
    extraKeys: {},
  });
});

test("a typed answer lands in the file the way the create dialog would write it", () => {
  const next = withJobField(FILE, "role", "  Billing   specialist ​ ");
  assert.equal(parseJobDescription(next).fields.role, "Billing specialist");
  // And it is capped, so a pasted page never becomes a frontmatter value.
  const pasted = withJobField(FILE, "industry", "a".repeat(5_000));
  assert.equal(parseJobDescription(pasted).fields.industry?.length, 64);
});

test("a fact a save cannot answer for is not a fact it may delete", () => {
  const withExtra = `---
industry: Healthcare
seniority: lead
role: Medical coder
---

Body.
`;
  const next = withJobField(withExtra, "industry", "Freight");
  assert.match(
    next,
    /^---\nindustry: Freight\nrole: Medical coder\nseniority: lead\n---\n/,
  );
});

test("finds the chip a stored answer was picked from, whatever its casing", () => {
  const ids = ["healthcare", "freight"] as const;
  const label = (id: (typeof ids)[number]) =>
    id === "healthcare" ? "Salud" : "Logística";
  assert.equal(choiceIdForLabel(ids, label, "Logistica"), "freight");
  assert.equal(choiceIdForLabel(ids, label, "  salud "), "healthcare");
  // Words of the user's own match no chip: the picker opens on the typed field.
  assert.equal(choiceIdForLabel(ids, label, "Cetrería"), null);
  assert.equal(choiceIdForLabel(ids, label, null), null);
});

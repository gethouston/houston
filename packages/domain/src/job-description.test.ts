import { expect, test } from "vitest";
import {
  composeJobDescription,
  parseJobDescription,
  renderJobDescriptionForPrompt,
} from "./job-description";

const FILE = `---
industry: Healthcare
role: Medical coder
---

You code charts for a clinic.
`;

test("parses the frontmatter block and the free description below it", () => {
  const parsed = parseJobDescription(FILE);

  expect(parsed.fields).toEqual({
    industry: "Healthcare",
    role: "Medical coder",
  });
  expect(parsed.body).toBe("You code charts for a clinic.");
  expect(parsed.extraKeys).toEqual({});
});

test("composes the same bytes it parsed", () => {
  const { fields, body } = parseJobDescription(FILE);

  expect(composeJobDescription({ ...fields, body }, FILE)).toBe(FILE);
});

test("quotes values a plain scalar would not survive", () => {
  const values = [
    "Law: corporate",
    "# 1 in support",
    'He said "hi"',
    "- dash first",
    "yes",
    "123",
    "two\nlines",
  ];

  for (const value of values) {
    const text = composeJobDescription({
      industry: value,
      role: null,
      body: "Body.",
    });
    // Whatever the quoting, the block stays ONE line per key and reads back
    // byte-identical - that is the contract the app's writer shares.
    const lines = text.split("\n");
    expect(lines[0]).toBe("---");
    expect(lines[2]).toBe("---");
    expect(parseJobDescription(text).fields.industry).toBe(value);
  }
});

test("a job description with no frontmatter is all body", () => {
  const plain = "You are a medical coder.\n\nYou never invent codes.";
  const parsed = parseJobDescription(plain);

  expect(parsed.fields).toEqual({ industry: null, role: null });
  expect(parsed.body).toBe(plain);
});

test("writes a plain value plain and quotes one that carries structure", () => {
  // The exact bytes a newly created agent's file is made of: the block reads
  // like two facts, not like config, and a value a bare scalar could not
  // survive is written JSON-style so it reads back byte-identical.
  expect(
    composeJobDescription({ industry: "Healthcare", role: null, body: "" }),
  ).toBe("---\nindustry: Healthcare\n---\n");
  expect(
    composeJobDescription({ industry: "Retail: online", role: null, body: "" }),
  ).toBe('---\nindustry: "Retail: online"\n---\n');
});

test("a rule in the middle of a document is a rule, not a block", () => {
  const text = "Intro\n\n---\n\nMore\n";

  expect(parseJobDescription(text)).toEqual({
    fields: { industry: null, role: null },
    body: "Intro\n\n---\n\nMore",
    extraKeys: {},
  });
});

test("an opening fence that never closes leaves the whole file as the body", () => {
  // A job description caught mid-edit, or an excerpt cut by a length cap.
  const text = "---\nindustry: Healthcare\nstill typing";

  expect(parseJobDescription(text)).toEqual({
    fields: { industry: null, role: null },
    body: text,
    extraKeys: {},
  });
});

test("a blank value and a whitespace value are the same absence", () => {
  const parsed = parseJobDescription("---\nindustry:\nrole:    \n---\n");

  expect(parsed.fields).toEqual({ industry: null, role: null });
  expect(parsed.body).toBe("");
});

test("one fact alone still earns the block, and none earns nothing", () => {
  expect(
    composeJobDescription({ industry: null, role: "Dispatcher", body: "" }),
  ).toBe("---\nrole: Dispatcher\n---\n");
  expect(composeJobDescription({ industry: null, role: null, body: "" })).toBe(
    "",
  );
});

test("a body that merely opens with a rule is not frontmatter", () => {
  // `---` then prose then `---` parses as YAML, but not as a map: keep the text.
  const text = "---\njust a rule, then words\n---\n\nThe rest.";

  expect(parseJobDescription(text)).toEqual({
    fields: { industry: null, role: null },
    body: text,
    extraKeys: {},
  });
});

test("keeps unknown keys, in order, after the known ones", () => {
  const previous = `---
color: blue
industry: Healthcare
seeded_by: store
---

Body.
`;
  const { fields, body } = parseJobDescription(previous);

  expect(fields).toEqual({ industry: "Healthcare", role: null });
  expect(Object.keys(parseJobDescription(previous).extraKeys)).toEqual([
    "color",
    "seeded_by",
  ]);
  expect(
    composeJobDescription({ ...fields, role: "Coder", body }, previous),
  ).toBe(`---
industry: Healthcare
role: Coder
color: blue
seeded_by: store
---

Body.
`);
});

test("reads a CRLF file", () => {
  const parsed = parseJobDescription(FILE.replace(/\n/g, "\r\n"));

  expect(parsed.fields).toEqual({
    industry: "Healthcare",
    role: "Medical coder",
  });
  expect(parsed.body).toBe("You code charts for a clinic.");
});

test("blank fields write no block at all", () => {
  expect(
    composeJobDescription({ industry: null, role: "  ", body: "Just prose." }),
  ).toBe("Just prose.\n");
});

test("the prompt sees two plain lines, never YAML", () => {
  expect(renderJobDescriptionForPrompt(FILE)).toBe(
    "Industry: Healthcare\nRole: Medical coder\n\nYou code charts for a clinic.",
  );
});

test("the prompt drops a field the user left blank", () => {
  const text = composeJobDescription({
    industry: null,
    role: "Medical coder",
    body: "You code charts.",
  });

  expect(renderJobDescriptionForPrompt(text)).toBe(
    "Role: Medical coder\n\nYou code charts.",
  );
});

test("a job description with no frontmatter reaches the prompt unchanged", () => {
  expect(renderJobDescriptionForPrompt("You are a coder.")).toBe(
    "You are a coder.",
  );
});

test("every frontmatter key reaches the prompt as a plain line", () => {
  const text = `---
industry: Healthcare
seniority: lead
role: Medical coder
seeded_by: store
---

You code charts.
`;

  expect(renderJobDescriptionForPrompt(text)).toBe(
    [
      "Industry: Healthcare",
      "Role: Medical coder",
      "seniority: lead",
      "seeded_by: store",
      "",
      "You code charts.",
    ].join("\n"),
  );
});

test("a block holding none of our fields still reads as facts, never YAML", () => {
  const text = "---\ncolor: blue\n---\n\nYou code charts.";

  expect(renderJobDescriptionForPrompt(text)).toBe(
    "color: blue\n\nYou code charts.",
  );
});

test("a number, a flag, a list and a map each reach the model on one line", () => {
  const text = `---
team_size: 12
remote: true
tags:
  - billing
  - claims
hours:
  start: 9
  end: 17
---

Body.
`;
  const rendered = renderJobDescriptionForPrompt(text);

  expect(rendered).toBe(
    [
      "team_size: 12",
      "remote: true",
      'tags: ["billing","claims"]',
      'hours: {"start":9,"end":17}',
      "",
      "Body.",
    ].join("\n"),
  );
  expect(rendered).not.toContain("[object Object]");
});

test("a key the file left blank is dropped, like a blank field", () => {
  expect(
    renderJobDescriptionForPrompt("---\ncolor:\nrole: Coder\n---\n\nBody."),
  ).toBe("Role: Coder\n\nBody.");
});

test("an empty block is a block, not the first lines of the description", () => {
  const parsed = parseJobDescription("---\n---\n\nJust prose.\n");

  expect(parsed).toEqual({
    fields: { industry: null, role: null },
    body: "Just prose.",
    extraKeys: {},
  });
});

test("a description that opens with a block of its own survives the round trip", () => {
  const body = "---\ncolor: blue\n---\n\nThe rest of the description.";
  const text = composeJobDescription({ industry: null, role: null, body });

  expect(parseJobDescription(text)).toEqual({
    fields: { industry: null, role: null },
    body,
    extraKeys: {},
  });
  expect(renderJobDescriptionForPrompt(text)).toBe(body);
});

const NESTED = `---
industry:
  primary: Healthcare
  secondary: Insurance
role: Medical coder
---

You code charts for a clinic.
`;

test("a known key holding a map is kept, not swallowed by a blank field", () => {
  const parsed = parseJobDescription(NESTED);

  expect(parsed.fields).toEqual({ industry: null, role: "Medical coder" });
  expect(parsed.extraKeys).toEqual({
    industry: { primary: "Healthcare", secondary: "Insurance" },
  });
});

test("a map under a known key survives a rewrite of the same file", () => {
  const { fields, body } = parseJobDescription(NESTED);
  const rewritten = composeJobDescription({ ...fields, body }, NESTED);

  expect(parseJobDescription(rewritten)).toEqual({
    fields: { industry: null, role: "Medical coder" },
    body: "You code charts for a clinic.",
    extraKeys: {
      industry: { primary: "Healthcare", secondary: "Insurance" },
    },
  });
});

test("a list under a known key survives a rewrite of the same file", () => {
  const previous = `---
industry: Healthcare
role:
  - Medical coder
  - Biller
---

Body.
`;
  const { fields, body, extraKeys } = parseJobDescription(previous);

  expect(fields).toEqual({ industry: "Healthcare", role: null });
  expect(extraKeys).toEqual({ role: ["Medical coder", "Biller"] });
  expect(
    parseJobDescription(composeJobDescription({ ...fields, body }, previous)),
  ).toEqual({
    fields,
    body,
    extraKeys,
  });
});

test("answering the field later writes the typed answer, once", () => {
  const answered = composeJobDescription(
    { industry: "Healthcare", role: "Medical coder", body: "Body." },
    NESTED,
  );

  expect(answered.match(/^industry:/gm)).toHaveLength(1);
  expect(answered).not.toContain("primary");
  expect(parseJobDescription(answered)).toEqual({
    fields: { industry: "Healthcare", role: "Medical coder" },
    body: "Body.",
    extraKeys: {},
  });
});

test("a kept map reaches the model once, on one line", () => {
  const rendered = renderJobDescriptionForPrompt(NESTED);

  expect(rendered).toBe(
    [
      "Role: Medical coder",
      'industry: {"primary":"Healthcare","secondary":"Insurance"}',
      "",
      "You code charts for a clinic.",
    ].join("\n"),
  );
  expect(rendered.match(/Healthcare/g)).toHaveLength(1);
});

test("a key written as an empty string says nothing to the model", () => {
  expect(
    renderJobDescriptionForPrompt('---\ncolor: ""\nrole: Coder\n---\n\nBody.'),
  ).toBe("Role: Coder\n\nBody.");
});

test("a byte-order mark above the fence does not hide the block", () => {
  const parsed = parseJobDescription(`\uFEFF${FILE}`);

  expect(parsed.fields).toEqual({
    industry: "Healthcare",
    role: "Medical coder",
  });
  expect(parsed.body).toBe("You code charts for a clinic.");
  expect(parsed).toEqual(parseJobDescription(FILE));
});

test("blank lines above the fence do not hide the block", () => {
  expect(parseJobDescription(`\n  \n\n${FILE}`)).toEqual(
    parseJobDescription(FILE),
  );
});

test("a file that arrives with a byte-order mark is written back without one", () => {
  const { fields, body } = parseJobDescription(`\uFEFF${FILE}`);

  expect(composeJobDescription({ ...fields, body }, `\uFEFF${FILE}`)).toBe(
    FILE,
  );
});

test("a description that opens with blank lines is still all body", () => {
  expect(parseJobDescription("\n\n  \nYou are a coder.\n")).toEqual({
    fields: { industry: null, role: null },
    body: "You are a coder.",
    extraKeys: {},
  });
});

test("a fenced description survives under a block that does hold facts", () => {
  const body = "---\ncolor: blue\n---\n\nThe rest.";
  const text = composeJobDescription({
    industry: "Healthcare",
    role: null,
    body,
  });
  const parsed = parseJobDescription(text);

  expect(parsed.fields).toEqual({ industry: "Healthcare", role: null });
  expect(parsed.body).toBe(body);
});

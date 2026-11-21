import assert from "node:assert/strict";
import test from "node:test";
import { parseJobDescription } from "@houston/sdk/job-description";
import {
  AGENT_ROLE_PART_MAX_LENGTH,
  buildAgentRoleJobDescription,
  capRolePart,
  createAgentRoleContext,
  jobDescriptionRoleContext,
} from "../src/lib/agent-role-context.ts";

test("a typed answer is capped as it is written, not only on the way out", () => {
  const written = capRolePart("a".repeat(200));
  assert.equal([...written].length, AGENT_ROLE_PART_MAX_LENGTH);
  assert.equal(
    capRolePart("🚚".repeat(200)),
    "🚚".repeat(AGENT_ROLE_PART_MAX_LENGTH),
  );
  assert.equal(capRolePart("Freight  dispatch "), "Freight  dispatch ");
});

test("normalizes context and role before creating the brief", () => {
  assert.deepEqual(
    createAgentRoleContext({
      context: "  Healthcare   services ",
      role: " Operations   coordinator ",
    }),
    {
      context: "Healthcare services",
      role: "Operations coordinator",
    },
  );
});

test("caps a pasted answer instead of seeding a novel into the agent", () => {
  const brief = createAgentRoleContext({
    context: "a".repeat(50_000),
    role: `${"b".repeat(80)}   ${"c".repeat(80)}`,
  });
  assert.ok(brief);
  assert.equal(brief.context.length, AGENT_ROLE_PART_MAX_LENGTH);
  assert.equal(brief.role.length, AGENT_ROLE_PART_MAX_LENGTH);
  assert.ok(buildAgentRoleJobDescription(brief).length < 2_000);
});

test("caps in code points, so a truncated emoji answer stays readable", () => {
  const brief = createAgentRoleContext({
    context: "🚚".repeat(200),
    role: "Dispatcher",
  });
  assert.ok(brief);
  assert.equal(brief.context, "🚚".repeat(AGENT_ROLE_PART_MAX_LENGTH));
});

test("invisible characters are not an answer", () => {
  const invisible = "​‌‍⁠﻿­";
  assert.equal(
    createAgentRoleContext({ context: invisible, role: invisible }),
    null,
  );
  assert.equal(
    createAgentRoleContext({ context: "Freight", role: invisible }),
    null,
  );
  assert.deepEqual(
    createAgentRoleContext({
      context: `Fre​ight`,
      role: `Dis﻿patcher`,
    }),
    { context: "Freight", role: "Dispatcher" },
  );
});

test("refuses to build the brief until both answers are present", () => {
  assert.equal(createAgentRoleContext({ context: "Legal", role: " " }), null);
  assert.equal(createAgentRoleContext({ context: " ", role: "Analyst" }), null);
});

test("creates the agent with the two facts and no prose of our own", () => {
  const file = buildAgentRoleJobDescription({
    context: "Healthcare",
    role: "Operations coordinator",
  });
  assert.equal(
    file,
    "---\nindustry: Healthcare\nrole: Operations coordinator\n---\n",
  );
  assert.deepEqual(parseJobDescription(file), {
    fields: { industry: "Healthcare", role: "Operations coordinator" },
    body: "",
    extraKeys: {},
  });
});

test("an answer carrying a colon is written so it reads back whole", () => {
  const file = buildAgentRoleJobDescription({
    context: "Retail: online",
    role: "Dispatcher",
  });
  assert.equal(
    file,
    '---\nindustry: "Retail: online"\nrole: Dispatcher\n---\n',
  );
  assert.equal(parseJobDescription(file).fields.industry, "Retail: online");
});

test("an imported agent's brief is read back off its job description", () => {
  assert.deepEqual(
    jobDescriptionRoleContext(
      "---\nindustry: Finance\nrole: Financial analyst\n---\nI close the books.\n",
    ),
    { context: "Finance", role: "Financial analyst" },
  );
});

test("half a brief is no brief: the hello names the agent alone", () => {
  assert.equal(
    jobDescriptionRoleContext("---\nindustry: Finance\n---\n"),
    undefined,
  );
  assert.equal(
    jobDescriptionRoleContext("---\nrole: Financial analyst\n---\n"),
    undefined,
  );
  assert.equal(jobDescriptionRoleContext("Just prose.\n"), undefined);
  assert.equal(jobDescriptionRoleContext(""), undefined);
  assert.equal(jobDescriptionRoleContext(undefined), undefined);
});

test("a brief read back is normalized exactly like a typed one", () => {
  assert.deepEqual(
    jobDescriptionRoleContext(
      `---\nindustry: "  Retail   online  "\nrole: "  Dispatcher  "\n---\n`,
    ),
    { context: "Retail online", role: "Dispatcher" },
  );
});

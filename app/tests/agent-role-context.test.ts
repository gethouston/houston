import assert from "node:assert/strict";
import test from "node:test";
import { parseJobDescription } from "@houston/sdk/job-description";
import {
  AGENT_ROLE_PART_MAX_LENGTH,
  buildAgentRoleJobDescription,
  capRolePart,
  createAgentRoleContext,
} from "../src/lib/agent-role-context.ts";

test("a typed answer is capped as it is written, not only on the way out", () => {
  // What the state holds while the user is still typing. The seeded path (the
  // filter's query taken as the answer) writes through here too, so a 200-char
  // query cannot land 200 characters in the field the cap is supposed to own.
  const written = capRolePart("a".repeat(200));
  assert.equal([...written].length, AGENT_ROLE_PART_MAX_LENGTH);
  // Code points, so a truncated emoji answer never ends in half a character.
  assert.equal(
    capRolePart("🚚".repeat(200)),
    "🚚".repeat(AGENT_ROLE_PART_MAX_LENGTH),
  );
  // Short answers are held verbatim: no trim, which would fight the caret
  // mid-word, and no collapse of the space the user just typed.
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
  // The file the agent is created with is bounded by the same cap.
  assert.ok(buildAgentRoleJobDescription(brief).length < 2_000);
});

test("caps in code points, so a truncated emoji answer stays readable", () => {
  const brief = createAgentRoleContext({
    context: "🚚".repeat(200),
    role: "Dispatcher",
  });
  assert.ok(brief);
  // Whole emoji, never a lone surrogate half left by a UTF-16 slice.
  assert.equal(brief.context, "🚚".repeat(AGENT_ROLE_PART_MAX_LENGTH));
});

test("invisible characters are not an answer", () => {
  // Zero-width space, ZWNJ, ZWJ, word joiner, BOM, soft hyphen.
  const invisible = "​‌‍⁠﻿­";
  assert.equal(
    createAgentRoleContext({ context: invisible, role: invisible }),
    null,
  );
  assert.equal(
    createAgentRoleContext({ context: "Freight", role: invisible }),
    null,
  );
  // And they never survive inside a real answer either.
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
  // The whole file: a block of facts, and a description left for the user and
  // the agent to write. Nothing we invented on their behalf.
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
  // The two facts are the user's own words, punctuation included; a value that
  // would not survive as a bare YAML scalar is quoted rather than mangled.
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

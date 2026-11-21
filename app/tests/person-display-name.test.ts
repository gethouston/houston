import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { personDisplayName } from "../src/components/organization/people-tab-model.ts";

const member = (displayName: string | undefined, email?: string) => ({
  displayName,
  email,
  userId: "user-1",
});

test("the name a person set wins, trimmed", () => {
  strictEqual(personDisplayName(member("  Ada  ", "ada@x.com"), "?"), "Ada");
});

test("a missing name falls through to the email", () => {
  strictEqual(
    personDisplayName(member(undefined, "ada@x.com"), "?"),
    "ada@x.com",
  );
});

test("a blank name counts as absent", () => {
  strictEqual(personDisplayName(member("", "ada@x.com"), "?"), "ada@x.com");
  strictEqual(personDisplayName(member("   ", "ada@x.com"), "?"), "ada@x.com");
});

test("a blank email counts as absent too", () => {
  strictEqual(personDisplayName(member(" ", "  "), "Teammate"), "Teammate");
});

test("the caller's last resort names a person with nothing else", () => {
  strictEqual(
    personDisplayName(member(undefined, undefined), "Teammate"),
    "Teammate",
  );
});

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

test("every surface naming a person spells it through the one rule", () => {
  for (const rel of [
    "../src/components/organization/people-roster-row.tsx",
    "../src/components/organization/people-roster-confirm.tsx",
    "../src/components/organization/org-roster.ts",
    "../src/components/agent-settings/agent-person-row.tsx",
    "../src/components/agent-settings/agent-people-model.ts",
    "../src/components/organization/org-chart-people.ts",
  ])
    ok(
      /\b(personDisplayName|rosterPersonName)\b/.test(read(rel)),
      `${rel} names a person through the shared helper`,
    );
});

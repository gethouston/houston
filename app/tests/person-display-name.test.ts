import { strictEqual } from "node:assert";
import { test } from "node:test";
import { personDisplayName } from "../src/components/organization/people-tab-model.ts";

/**
 * A person's row is the one place their identity is asserted, so a name the
 * gateway stored as blank must not win over the email that would actually name
 * them: a row rendering an empty line names nobody and looks like a bug.
 */

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

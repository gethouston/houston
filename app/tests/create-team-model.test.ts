import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  MAX_TEAM_NAME_LENGTH,
  validateTeamName,
} from "../src/components/shell/create-team-model.ts";

describe("validateTeamName", () => {
  it("rejects an empty string", () => {
    deepStrictEqual(validateTeamName(""), { ok: false, reason: "empty" });
  });

  it("rejects a whitespace-only string (trim-then-check)", () => {
    deepStrictEqual(validateTeamName("   \t\n "), {
      ok: false,
      reason: "empty",
    });
  });

  it("accepts a normal name and returns the trimmed value", () => {
    deepStrictEqual(validateTeamName("  Marketing  "), {
      ok: true,
      name: "Marketing",
    });
  });

  it("accepts a name exactly at the length ceiling", () => {
    const name = "a".repeat(MAX_TEAM_NAME_LENGTH);
    deepStrictEqual(validateTeamName(name), { ok: true, name });
  });

  it("does not count trimmed whitespace toward the ceiling", () => {
    const name = "a".repeat(MAX_TEAM_NAME_LENGTH);
    deepStrictEqual(validateTeamName(`  ${name}  `), { ok: true, name });
  });

  it("rejects a name past the length ceiling", () => {
    deepStrictEqual(validateTeamName("a".repeat(MAX_TEAM_NAME_LENGTH + 1)), {
      ok: false,
      reason: "too_long",
    });
  });
});

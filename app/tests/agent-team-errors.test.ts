import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  agentTeamErrorCode,
  agentTeamErrorCopy,
  isExpectedAgentTeamError,
} from "../src/lib/agent-team-errors.ts";

// C13's expected-state taxonomy: which gateway rejections the agent-teams
// surfaces EXPLAIN, and which must still reach us as a bug report.

/** The FLAT `{error, code}` body the Go edge answers a rejection with. */
const flat = (code: string, error = "a human sentence") => ({
  body: { error, code },
});

const EXPECTED = [
  "default_team",
  "personal_space",
  "not_team_owner",
  "invalid_team_id",
  "invalid_name",
  "not_a_member",
];

describe("agentTeamErrorCode", () => {
  it("reads the FLAT gateway body the edge actually sends", () => {
    assert.equal(agentTeamErrorCode(flat("default_team")), "default_team");
  });

  it("reads the nested and top-level shapes too (shareErrorCode's ladder)", () => {
    assert.equal(agentTeamErrorCode({ kind: "not_a_member" }), "not_a_member");
    assert.equal(
      agentTeamErrorCode({ code: "personal_space" }),
      "personal_space",
    );
    assert.equal(
      agentTeamErrorCode({ body: { error: { code: "not_team_owner" } } }),
      "not_team_owner",
    );
  });

  it("is undefined for an error carrying no code at all", () => {
    assert.equal(agentTeamErrorCode(new Error("boom")), undefined);
    assert.equal(agentTeamErrorCode(null), undefined);
    assert.equal(agentTeamErrorCode(undefined), undefined);
  });
});

describe("isExpectedAgentTeamError", () => {
  it("is true for every expected C13 business state", () => {
    for (const code of EXPECTED) {
      assert.equal(isExpectedAgentTeamError(flat(code)), true, code);
    }
  });

  it("is false for the codes that mean the client sent something wrong", () => {
    // These must keep the red report-a-bug toast: they are Houston bugs.
    for (const code of [
      "team_not_found",
      "invalid_sort_order",
      "invalid_owner",
      "needs_upgrade",
    ]) {
      assert.equal(isExpectedAgentTeamError(flat(code)), false, code);
    }
  });

  // `invalid_name` is the one rejection the USER can provoke by typing, so it
  // reads as a calm sentence rather than a bug report. The inputs cap the name
  // at 60 runes; this is what remains if one ever gets past them.
  it("is true for invalid_name, which a user can type their way into", () => {
    assert.equal(isExpectedAgentTeamError(flat("invalid_name")), true);
  });

  it("is false for a plain error and for nothing at all", () => {
    assert.equal(isExpectedAgentTeamError(new Error("network down")), false);
    assert.equal(isExpectedAgentTeamError(undefined), false);
  });
});

describe("agentTeamErrorCopy", () => {
  it("maps each expected code to its title/body keys in the teams namespace", () => {
    for (const code of EXPECTED) {
      assert.deepEqual(agentTeamErrorCopy(flat(code)), {
        titleKey: `teams:agentTeams.errors.${code}.title`,
        bodyKey: `teams:agentTeams.errors.${code}.body`,
      });
    }
  });

  it("is null for an unexpected rejection, so the bug toast owns the surface", () => {
    assert.equal(agentTeamErrorCopy(flat("team_not_found")), null);
    assert.equal(agentTeamErrorCopy(new Error("boom")), null);
    assert.equal(agentTeamErrorCopy(null), null);
  });

  // The keys are only worth returning if the copy exists in every language: a
  // missing pair renders the raw key, which is worse than the bug toast.
  it("has real title/body copy in en, es and pt for every expected code", () => {
    const localesDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "../src/locales",
    );
    for (const lang of ["en", "es", "pt"]) {
      const teams = JSON.parse(
        readFileSync(join(localesDir, lang, "teams.json"), "utf8"),
      );
      for (const code of EXPECTED) {
        const pair = teams.agentTeams.errors[code];
        assert.ok(pair?.title, `${lang}/${code}.title`);
        assert.ok(pair?.body, `${lang}/${code}.body`);
      }
    }
  });
});

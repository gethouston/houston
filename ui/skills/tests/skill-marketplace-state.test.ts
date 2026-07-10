import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  CATEGORY_ALL,
  effectiveSearchTerm,
  resultsPhase,
  searchErrorPhase,
  searchingPrevious,
  showsShelves,
} from "../src/skill-marketplace-state-model.ts";
import type { CommunitySkill } from "../src/types.ts";

function skill(id: string, source = "acme/repo"): CommunitySkill {
  return { id, skillId: id, name: id, installs: 0, source };
}

describe("resultsPhase", () => {
  it("returns no-results for an empty list", () => {
    assert.deepEqual(resultsPhase([], "sdr"), {
      kind: "no-results",
      query: "sdr",
    });
  });
  it("returns results for a non-empty list", () => {
    const skills = [skill("a")];
    assert.deepEqual(resultsPhase(skills, "sdr"), {
      kind: "results",
      skills,
      query: "sdr",
    });
  });
});

describe("effectiveSearchTerm", () => {
  it("prefers a typed query over the selected category", () => {
    assert.equal(effectiveSearchTerm("  crm  ", "marketing"), "crm");
  });
  it("falls back to the selected category's query when nothing is typed", () => {
    assert.equal(effectiveSearchTerm("", "marketing"), "marketing");
    assert.equal(effectiveSearchTerm("   ", "sales"), "sales");
  });
  it("is empty (browse) when nothing is typed and no category is selected", () => {
    assert.equal(effectiveSearchTerm("", null), "");
  });
});

describe("showsShelves", () => {
  it("shows the browse shelves only with no query and All selected", () => {
    assert.equal(showsShelves("", CATEGORY_ALL), true);
    assert.equal(showsShelves("  ", CATEGORY_ALL), true);
  });
  it("hides the shelves once a query is typed or a category is picked", () => {
    assert.equal(showsShelves("crm", CATEGORY_ALL), false);
    assert.equal(showsShelves("", "marketing"), false);
  });
});

describe("searchErrorPhase", () => {
  it("returns null for an abort so the phase is left untouched", () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    assert.equal(searchErrorPhase(aborted, "sdr"), null);
  });
  it("maps a rate-limit error to the rate_limited reason", () => {
    const err = { kind: "rate_limited" };
    assert.deepEqual(searchErrorPhase(err, "sdr"), {
      kind: "search-error",
      reason: "rate_limited",
      query: "sdr",
    });
  });
  it("maps an offline TypeError to the offline reason", () => {
    const err = new TypeError("failed to fetch");
    assert.deepEqual(searchErrorPhase(err, "sdr"), {
      kind: "search-error",
      reason: "offline",
      query: "sdr",
    });
  });
  it("maps anything else to the generic reason", () => {
    assert.deepEqual(searchErrorPhase(new Error("boom"), "sdr"), {
      kind: "search-error",
      reason: "generic",
      query: "sdr",
    });
  });
});

describe("searchingPrevious", () => {
  it("keeps a live result set visible during the next search", () => {
    const skills = [skill("a"), skill("b")];
    assert.deepEqual(
      searchingPrevious({ kind: "results", skills, query: "sdr" }),
      skills,
    );
  });
  it("carries the previous list through a chained search", () => {
    const skills = [skill("a")];
    assert.deepEqual(
      searchingPrevious({ kind: "searching", previous: skills }),
      skills,
    );
  });
  it("resets to empty from a search error", () => {
    assert.deepEqual(
      searchingPrevious({
        kind: "search-error",
        reason: "generic",
        query: "sdr",
      }),
      [],
    );
  });
  it("resets to empty from idle", () => {
    assert.deepEqual(searchingPrevious({ kind: "idle" }), []);
  });
});

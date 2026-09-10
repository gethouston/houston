import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonEngineError } from "../../packages/web/src/engine-adapter/client/errors.ts";
import {
  isExpectedSkillPreviewError,
  isUnavailableSkillError,
} from "../src/lib/skill-install-expected-state.ts";

/** The engine-client's error exposes `kind` from `error.details.kind`. */
function engineClientError(kind: string, status = 404): Error {
  return Object.assign(new Error(`engine error (${kind})`), {
    name: "HoustonEngineError",
    status,
    kind,
  });
}

describe("isUnavailableSkillError (PRODUCT-1729)", () => {
  it("treats a skill missing from a live repo as expected on the web adapter's shape", () => {
    const err = new HoustonEngineError(404, {
      error: {
        code: "NOT_FOUND",
        message: "Could not find 'spreadsheet' in openai/skills",
        kind: "skill_not_in_repo",
        details: { kind: "skill_not_in_repo" },
      },
    });
    strictEqual(isUnavailableSkillError(err), true);
  });

  it("treats a deleted repo as expected on the engine-client's shape", () => {
    strictEqual(
      isUnavailableSkillError(engineClientError("repo_not_found")),
      true,
    );
    strictEqual(
      isUnavailableSkillError(engineClientError("skill_not_in_repo")),
      true,
    );
  });

  it("keeps rate limits and offline loud for the install handler's own copy", () => {
    strictEqual(
      isUnavailableSkillError(engineClientError("github_rate_limited", 429)),
      false,
    );
    strictEqual(
      isUnavailableSkillError(engineClientError("offline", 503)),
      false,
    );
  });

  it("keeps untyped failures loud", () => {
    strictEqual(isUnavailableSkillError(new Error("boom")), false);
    strictEqual(isUnavailableSkillError(null), false);
  });
});

describe("isExpectedSkillPreviewError (PRODUCT-1729)", () => {
  it("adds GitHub quota and transport misses to the quiet preview set", () => {
    strictEqual(
      isExpectedSkillPreviewError(
        engineClientError("github_rate_limited", 429),
      ),
      true,
    );
    strictEqual(
      isExpectedSkillPreviewError(engineClientError("offline", 503)),
      true,
    );
    strictEqual(
      isExpectedSkillPreviewError(engineClientError("repo_not_found")),
      true,
    );
  });
  it("keeps a malformed skill and untyped failures loud", () => {
    strictEqual(
      isExpectedSkillPreviewError(engineClientError("skill_malformed", 400)),
      false,
    );
    strictEqual(isExpectedSkillPreviewError(new Error("boom")), false);
  });
});

import { match, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  isSharedSkillsUnconfiguredError,
  SHARED_SKILLS_UNCONFIGURED,
  sharedSkillsAvailable,
} from "../src/lib/shared-skills-availability.ts";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const engineError = (status: number, body: unknown) => ({
  status,
  body,
  message: "engine error",
});

describe("isSharedSkillsUnconfiguredError", () => {
  it("matches the gateway's 503 for a deployment with no skill store", () => {
    strictEqual(
      isSharedSkillsUnconfiguredError(
        engineError(503, { error: SHARED_SKILLS_UNCONFIGURED }),
      ),
      true,
    );
  });

  it("uses the gateway's exact wire string", () => {
    strictEqual(SHARED_SKILLS_UNCONFIGURED, "shared skills not configured");
  });

  it("does NOT match a waking pod — that one is retried, not hidden", () => {
    strictEqual(
      isSharedSkillsUnconfiguredError(
        engineError(503, {
          error: "engine unavailable",
          detail: "agent is waking",
        }),
      ),
      false,
    );
  });

  it("does NOT match other shared-skills failures", () => {
    strictEqual(
      isSharedSkillsUnconfiguredError(engineError(503, { error: "down" })),
      false,
    );
    strictEqual(
      isSharedSkillsUnconfiguredError(engineError(500, { error: "boom" })),
      false,
    );
    strictEqual(
      isSharedSkillsUnconfiguredError(engineError(401, { error: "no auth" })),
      false,
    );
    strictEqual(
      isSharedSkillsUnconfiguredError(
        engineError(404, { error: "workspace not found" }),
      ),
      false,
    );
  });

  it("never matches the same status carried on a different body shape", () => {
    strictEqual(isSharedSkillsUnconfiguredError(engineError(503, null)), false);
    strictEqual(isSharedSkillsUnconfiguredError(engineError(503, {})), false);
    strictEqual(
      isSharedSkillsUnconfiguredError(
        engineError(503, { detail: SHARED_SKILLS_UNCONFIGURED }),
      ),
      false,
    );
  });

  it("never matches a non-engine throw", () => {
    strictEqual(isSharedSkillsUnconfiguredError(undefined), false);
    strictEqual(isSharedSkillsUnconfiguredError(null), false);
    strictEqual(
      isSharedSkillsUnconfiguredError(new Error(SHARED_SKILLS_UNCONFIGURED)),
      false,
    );
    strictEqual(
      isSharedSkillsUnconfiguredError(SHARED_SKILLS_UNCONFIGURED),
      false,
    );
  });
});

describe("sharedSkillsAvailable", () => {
  it("hides the surface when the deployment has no store", () => {
    strictEqual(sharedSkillsAvailable(true, { configured: false }), false);
  });

  it("shows the surface when the store answered", () => {
    strictEqual(sharedSkillsAvailable(true, { configured: true }), true);
  });

  it("stays optimistic while the store list is still loading", () => {
    strictEqual(sharedSkillsAvailable(true, undefined), true);
  });

  it("never overrides a deployment that doesn't advertise the capability", () => {
    strictEqual(sharedSkillsAvailable(false, { configured: true }), false);
    strictEqual(sharedSkillsAvailable(false, undefined), false);
  });
});

describe("the list_shared_skills surfacing policy", () => {
  const tauri = read("../src/lib/tauri.ts");

  it("silences ONLY the unconfigured case at the call site", () => {
    match(
      tauri,
      /"list_shared_skills",[\s\S]{0,240}silence: isSharedSkillsUnconfiguredError/,
    );
  });

  it("converts only the typed error into the feature-absent value", () => {
    match(tauri, /if \(!isSharedSkillsUnconfiguredError\(err\)\) throw err;/);
    match(
      tauri,
      /return \{ configured: false, diagnostics: \[\], items: \[\] \}/,
    );
  });
});

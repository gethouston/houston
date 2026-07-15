import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  deriveInstalledSkillEditorState,
  skillMonogram,
} from "../src/installed-skill-editor-model.ts";

describe("deriveInstalledSkillEditorState", () => {
  it("is idle when collapsed regardless of content", () => {
    assert.deepEqual(
      deriveInstalledSkillEditorState({
        expanded: false,
        content: "loaded",
        hasError: true,
      }),
      { status: "idle" },
    );
  });

  it("is loading when expanded with no content and no error", () => {
    assert.deepEqual(
      deriveInstalledSkillEditorState({
        expanded: true,
        content: undefined,
        hasError: false,
      }),
      { status: "loading" },
    );
  });

  it("is ready with content once loaded", () => {
    assert.deepEqual(
      deriveInstalledSkillEditorState({
        expanded: true,
        content: "# Procedure",
        hasError: false,
      }),
      { status: "ready", content: "# Procedure" },
    );
  });

  it("keeps ready during a refetch even when an error also fires", () => {
    // Content already present wins over a stale error so an open editor never
    // flashes back to skeleton or error mid-refetch.
    assert.deepEqual(
      deriveInstalledSkillEditorState({
        expanded: true,
        content: "body",
        hasError: true,
      }),
      { status: "ready", content: "body" },
    );
  });

  it("is error when expanded, no content, and a non-missing load error", () => {
    assert.deepEqual(
      deriveInstalledSkillEditorState({
        expanded: true,
        content: undefined,
        hasError: true,
      }),
      { status: "error" },
    );
  });

  it("treats empty-string content as ready (a real empty skill body)", () => {
    assert.deepEqual(
      deriveInstalledSkillEditorState({
        expanded: true,
        content: "",
        hasError: false,
      }),
      { status: "ready", content: "" },
    );
  });
});

describe("skillMonogram", () => {
  it("uppercases the first letter", () => {
    assert.equal(skillMonogram("draft a contract"), "D");
  });

  it("trims leading whitespace", () => {
    assert.equal(skillMonogram("  research"), "R");
  });

  it("falls back to a placeholder on empty input", () => {
    assert.equal(skillMonogram("   "), "?");
  });
});

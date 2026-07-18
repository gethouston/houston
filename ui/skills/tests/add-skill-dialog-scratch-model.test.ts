import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  canSubmitScratchForm,
  needsDescriptionNudge,
  toSlug,
} from "../src/add-skill-dialog-scratch-model.ts";

describe("toSlug", () => {
  it("kebab-cases a free-form title", () => {
    assert.equal(toSlug("Draft a contract"), "draft-a-contract");
  });

  it("strips accents and collapses separator runs", () => {
    assert.equal(toSlug("  Envía   el--contrato!  "), "envia-el-contrato");
  });

  it("caps the slug at 64 chars", () => {
    assert.equal(toSlug("a".repeat(80)).length, 64);
  });
});

describe("needsDescriptionNudge", () => {
  it("stays quiet on a pristine form", () => {
    assert.equal(
      needsDescriptionNudge({ title: "", description: "", body: "" }, false),
      false,
    );
  });

  it("nudges once the field was visited and left empty", () => {
    assert.equal(
      needsDescriptionNudge({ title: "", description: "  ", body: "" }, true),
      true,
    );
  });

  it("nudges when the user skipped the field but filled everything else", () => {
    assert.equal(
      needsDescriptionNudge(
        { title: "this is custom 1", description: "", body: "say custom 1" },
        false,
      ),
      true,
    );
  });

  it("clears as soon as a description is entered", () => {
    assert.equal(
      needsDescriptionNudge(
        { title: "t", description: "Says custom 1 on ping.", body: "b" },
        true,
      ),
      false,
    );
  });
});

describe("canSubmitScratchForm", () => {
  const complete = {
    title: "this is custom 1",
    description: "Says custom 1 on ping.",
    body: "say custom 1 when the user says ping",
  };

  it("allows a complete form", () => {
    assert.equal(canSubmitScratchForm(complete, false), true);
  });

  it("blocks a missing description (engine rejects it with a 400)", () => {
    assert.equal(
      canSubmitScratchForm({ ...complete, description: "  " }, false),
      false,
    );
  });

  it("blocks missing title or body and taken slugs", () => {
    assert.equal(
      canSubmitScratchForm({ ...complete, title: " " }, false),
      false,
    );
    assert.equal(canSubmitScratchForm({ ...complete, body: "" }, false), false);
    assert.equal(canSubmitScratchForm(complete, true), false);
  });
});

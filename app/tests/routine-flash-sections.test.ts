import { deepStrictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import type { RoutineFormData } from "@houston-ai/routines";
import { changedEditorSections } from "../src/components/tabs/routine-flash-sections.ts";

// The "agent just changed this" flash lights exactly the editor sections an
// external routine edit touched — never more (a wrong section mis-attributes
// the change) and never fields the editor doesn't render (integrations).

const base: RoutineFormData = {
  name: "Morning digest",
  prompt: "Summarize my inbox.",
  schedule: "0 9 * * *",
  suppress_when_silent: false,
  chat_mode: "shared",
  integrations: [],
  provider: null,
  model: null,
  effort: null,
};

describe("changedEditorSections", () => {
  it("maps name/prompt to the hero details card", () => {
    deepStrictEqual(changedEditorSections(base, { ...base, name: "X" }), [
      "details",
    ]);
    deepStrictEqual(changedEditorSections(base, { ...base, prompt: "Y" }), [
      "details",
    ]);
  });

  it("maps the schedule to its own card", () => {
    deepStrictEqual(
      changedEditorSections(base, { ...base, schedule: "0 18 * * *" }),
      ["schedule"],
    );
  });

  it("maps toggles and the model pin to the behavior card", () => {
    deepStrictEqual(
      changedEditorSections(base, { ...base, suppress_when_silent: true }),
      ["behavior"],
    );
    deepStrictEqual(
      changedEditorSections(base, { ...base, chat_mode: "per_run" }),
      ["behavior"],
    );
    deepStrictEqual(
      changedEditorSections(base, { ...base, model: "claude-fable-5" }),
      ["behavior"],
    );
  });

  it("treats an absent and a null model pin as the same value", () => {
    const { provider: _p, model: _m, effort: _e, ...withoutPins } = base;
    deepStrictEqual(
      changedEditorSections(base, withoutPins as RoutineFormData),
      [],
    );
  });

  it("collects every touched section, in editor order", () => {
    deepStrictEqual(
      changedEditorSections(base, {
        ...base,
        name: "X",
        schedule: "0 18 * * *",
        chat_mode: "per_run",
      }),
      ["details", "schedule", "behavior"],
    );
  });

  it("ignores fields the editor does not render (integrations)", () => {
    deepStrictEqual(
      changedEditorSections(base, { ...base, integrations: ["gmail"] }),
      [],
    );
  });

  it("returns nothing when the forms match", () => {
    deepStrictEqual(changedEditorSections(base, { ...base }), []);
  });
});

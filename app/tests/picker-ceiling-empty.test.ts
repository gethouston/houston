import assert from "node:assert/strict";
import test from "node:test";
import type { ModelPickerProvider } from "@houston-ai/core";
import {
  ceilingEmptyAction,
  ceilingEmptyLabels,
  ceilingEmptyState,
} from "../src/components/chat-model-selector-ceiling.ts";
import en from "../src/locales/en/chat.json" with { type: "json" };

/**
 * PRODUCT-2074: a picker the allowed-models ceiling emptied used to say
 * "Connect an AI to start chatting" to someone with an AI already connected.
 * The ceiling story replaces it ONLY when the ceiling is the cause, and offers
 * the Models settings only to someone who can open them here.
 */

const p = (
  connection: ModelPickerProvider["connection"],
): Pick<ModelPickerProvider, "connection"> => ({ connection });

const base = {
  catalogState: "ready" as const,
  unclamped: [p("connected"), p("disconnected")],
  clamped: [],
  canManageAgent: true,
  modelsSectionReachable: true,
};

test("the ceiling emptied a connected picker: a manager gets the way to fix it", () => {
  assert.equal(ceilingEmptyState(base), "choose");
});

test("someone who does not manage the agent is told who to ask, whatever the space", () => {
  for (const modelsSectionReachable of [true, false]) {
    assert.equal(
      ceilingEmptyState({
        ...base,
        canManageAgent: false,
        modelsSectionReachable,
      }),
      "ask",
    );
  }
});

test("a manager with no Models settings in this space gets no dead-end button", () => {
  assert.equal(
    ceilingEmptyState({ ...base, modelsSectionReachable: false }),
    "unreachable",
  );
});

test("nothing connected before the ceiling keeps the connect story", () => {
  assert.equal(ceilingEmptyState({ ...base, unclamped: [] }), null);
  assert.equal(
    ceilingEmptyState({ ...base, unclamped: [p("disconnected")] }),
    null,
  );
  assert.equal(
    ceilingEmptyState({ ...base, unclamped: [p("checking")] }),
    null,
  );
});

test("a provider surviving the clamp means the list is not empty", () => {
  assert.equal(ceilingEmptyState({ ...base, clamped: [p("connected")] }), null);
});

test("an allowed model on an AI the viewer has not connected: connecting it is the fix", () => {
  // Manager allows Claude only; this member connected ChatGPT only. Claude
  // survives the clamp disconnected, so the story is Connect, not "ask", for
  // managers and members alike.
  for (const canManageAgent of [true, false]) {
    for (const modelsSectionReachable of [true, false]) {
      assert.equal(
        ceilingEmptyState({
          ...base,
          clamped: [p("disconnected")],
          canManageAgent,
          modelsSectionReachable,
        }),
        "connect",
      );
    }
  }
});

test("each story maps to the picker's empty-state action", () => {
  const choose = () => {};
  // undefined = the picker's own connect action, gated as it always was.
  assert.equal(ceilingEmptyAction(null, choose), undefined);
  assert.equal(ceilingEmptyAction("connect", choose), undefined);
  assert.equal(ceilingEmptyAction("choose", choose), choose);
  // null = no button: nobody standing here can act on these.
  assert.equal(ceilingEmptyAction("ask", choose), null);
  assert.equal(ceilingEmptyAction("unreachable", choose), null);
});

test("never decides while the catalog is still loading", () => {
  assert.equal(ceilingEmptyState({ ...base, catalogState: "loading" }), null);
});

test("the labels name the ceiling, never the connect copy", () => {
  const t = ((key: string) => key) as unknown as Parameters<
    typeof ceilingEmptyLabels
  >[0];
  assert.deepEqual(ceilingEmptyLabels(t, "ask"), {
    noProviders: "modelSelector.picker.ceilingEmpty.title",
    noProvidersHint: "modelSelector.picker.ceilingEmpty.hint.ask",
    noProvidersAction: "modelSelector.picker.ceilingEmpty.action",
  });
  // Connect's button IS the picker's connect action, so it keeps that label.
  assert.equal(
    ceilingEmptyLabels(t, "connect").noProvidersAction,
    "modelSelector.picker.noProviders.action",
  );
});

test("every ceiling story has authored English copy", () => {
  const copy = en.modelSelector.picker.ceilingEmpty;
  for (const state of ["connect", "choose", "ask", "unreachable"] as const) {
    assert.ok(copy.hint[state].length > 0, state);
  }
  assert.ok(copy.title.length > 0);
  assert.ok(copy.action.length > 0);
});

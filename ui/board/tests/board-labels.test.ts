import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import {
  composerHasHistory,
  composerPlaceholder,
  DEFAULT_AI_BOARD_LABELS,
} from "../src/board-labels.ts";

test("an uncreated conversation asks what to work on", () => {
  assert.equal(
    composerPlaceholder({ activeSessionKey: null }),
    "What should the AI Employee work on?",
  );
});

test("an unselected panel asks what to work on whatever the feed says", () => {
  for (const hasHistory of [false, true]) {
    assert.equal(
      composerPlaceholder({ activeSessionKey: null, hasHistory }),
      "What should the AI Employee work on?",
    );
  }
});

test("an open conversation with history asks for a follow-up", () => {
  assert.equal(
    composerPlaceholder({ activeSessionKey: "activity-1", hasHistory: true }),
    "Send a follow-up...",
  );
});

test("an open but empty conversation still asks what to work on", () => {
  assert.equal(
    composerPlaceholder({ activeSessionKey: "activity-1", hasHistory: false }),
    "What should the AI Employee work on?",
  );
});

test("passed labels win over the English defaults", () => {
  const labels = {
    composerPlaceholder: "¿En qué debería trabajar el empleado de IA?",
    followUpPlaceholder: "Envía un seguimiento...",
  };
  assert.equal(
    composerPlaceholder({ activeSessionKey: null, labels }),
    labels.composerPlaceholder,
  );
  assert.equal(
    composerPlaceholder({
      activeSessionKey: "activity-1",
      hasHistory: false,
      labels,
    }),
    labels.composerPlaceholder,
  );
  assert.equal(
    composerPlaceholder({
      activeSessionKey: "activity-1",
      hasHistory: true,
      labels,
    }),
    labels.followUpPlaceholder,
  );
});

test("a partial bundle falls back per key", () => {
  assert.equal(
    composerPlaceholder({
      activeSessionKey: null,
      labels: { followUpPlaceholder: "Envía un seguimiento..." },
    }),
    DEFAULT_AI_BOARD_LABELS.composerPlaceholder,
  );
  assert.equal(
    composerPlaceholder({
      activeSessionKey: "activity-1",
      hasHistory: false,
      labels: { followUpPlaceholder: "Envía un seguimiento..." },
    }),
    DEFAULT_AI_BOARD_LABELS.composerPlaceholder,
  );
  assert.equal(
    composerPlaceholder({
      activeSessionKey: "activity-1",
      hasHistory: true,
      labels: { composerPlaceholder: "¿En qué debería trabajar?" },
    }),
    DEFAULT_AI_BOARD_LABELS.followUpPlaceholder,
  );
});

describe("composerHasHistory", () => {
  it("treats an open conversation as history unless the surface opts in", () => {
    assert.equal(
      composerHasHistory({ asksOpeningWhenEmpty: false, feedLength: 0 }),
      true,
    );
    assert.equal(
      composerHasHistory({ asksOpeningWhenEmpty: false, feedLength: 3 }),
      true,
    );
  });

  it("reads the feed for a surface whose conversation is permanent", () => {
    assert.equal(
      composerHasHistory({ asksOpeningWhenEmpty: true, feedLength: 0 }),
      false,
    );
    assert.equal(
      composerHasHistory({ asksOpeningWhenEmpty: true, feedLength: 1 }),
      true,
    );
  });
});

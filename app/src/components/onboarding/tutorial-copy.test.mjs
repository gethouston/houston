import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFrameLabels,
  buildMissionMeta,
  TUTORIAL_STEPS,
} from "./tutorial-copy.ts";

const t = (key, options) => {
  if (!options) return key;
  return Object.entries(options).reduce(
    (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
    key,
  );
};

test("tutorial covers six mission stages in order", () => {
  assert.deepEqual(TUTORIAL_STEPS, [
    "meet",
    "brain",
    "try",
    "skill",
    "routine",
    "summary",
  ]);
});

test("mission meta exposes counter, title, body and the single next mission", () => {
  const meta = buildMissionMeta(t, "brain");
  assert.equal(meta.index, 1);
  assert.equal(meta.total, 6);
  assert.equal(meta.eyebrow, "setup:tutorial.eyebrow");
  assert.equal(meta.title, "setup:tutorial.missions.brain.title");
  assert.equal(meta.body, "setup:tutorial.missions.brain.body");
  assert.equal(meta.nextTitle, "setup:tutorial.missions.try.title");
});

test("try mission points to skill as next", () => {
  const meta = buildMissionMeta(t, "try");
  assert.equal(meta.index, 2);
  assert.equal(meta.nextTitle, "setup:tutorial.missions.skill.title");
});

test("skill mission points to routine as next", () => {
  const meta = buildMissionMeta(t, "skill");
  assert.equal(meta.index, 3);
  assert.equal(meta.nextTitle, "setup:tutorial.missions.routine.title");
});

test("routine mission points to summary as next", () => {
  const meta = buildMissionMeta(t, "routine");
  assert.equal(meta.index, 4);
  assert.equal(meta.nextTitle, "setup:tutorial.missions.summary.title");
});

test("final summary mission has no next mission", () => {
  const meta = buildMissionMeta(t, "summary");
  assert.equal(meta.index, 5);
  assert.equal(meta.nextTitle, null);
});

test("frame labels expose brand, counter and up-next strings", () => {
  const labels = buildFrameLabels(t, "try");
  assert.equal(labels.brandLabel, "setup:tutorial.brand");
  assert.equal(labels.counterLabel, "setup:tutorial.counter");
  assert.equal(labels.upNextLabel, "setup:tutorial.upNext");
});

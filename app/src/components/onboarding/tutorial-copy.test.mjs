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

test("setup covers the four steps in order", () => {
  assert.deepEqual(TUTORIAL_STEPS, ["meet", "brain", "tools", "email"]);
});

test("step meta exposes counter, title, body and the single next step", () => {
  const meta = buildMissionMeta(t, "brain");
  assert.equal(meta.index, 1);
  assert.equal(meta.total, 4);
  assert.equal(meta.eyebrow, "setup:tutorial.eyebrow");
  assert.equal(meta.title, "setup:tutorial.missions.brain.title");
  assert.equal(meta.body, "setup:tutorial.missions.brain.body");
  assert.equal(meta.nextTitle, "setup:tutorial.missions.tools.title");
});

test("tools step points to email as next", () => {
  const meta = buildMissionMeta(t, "tools");
  assert.equal(meta.index, 2);
  assert.equal(meta.nextTitle, "setup:tutorial.missions.email.title");
});

test("the email step is last and has no next", () => {
  const meta = buildMissionMeta(t, "email");
  assert.equal(meta.index, 3);
  assert.equal(meta.nextTitle, null);
});

test("frame labels expose brand, counter and up-next strings", () => {
  const labels = buildFrameLabels(t, "email");
  assert.equal(labels.brandLabel, "setup:tutorial.brand");
  assert.equal(labels.counterLabel, "setup:tutorial.counter");
  assert.equal(labels.upNextLabel, "setup:tutorial.upNext");
});

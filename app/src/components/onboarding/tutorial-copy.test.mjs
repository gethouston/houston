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

test("setup covers the steps in order", () => {
  assert.deepEqual(TUTORIAL_STEPS, [
    "meet",
    "brain",
    "providerLogin",
    "tools",
    "email",
  ]);
});

test("brain (pick) points to providerLogin as next", () => {
  const meta = buildMissionMeta(t, "brain");
  assert.equal(meta.index, 1);
  assert.equal(meta.total, 5);
  assert.equal(meta.title, "setup:tutorial.missions.brain.title");
  assert.equal(meta.nextTitle, "setup:tutorial.missions.providerLogin.title");
});

test("providerLogin (connect) points to tools as next", () => {
  const meta = buildMissionMeta(t, "providerLogin");
  assert.equal(meta.index, 2);
  assert.equal(meta.nextTitle, "setup:tutorial.missions.tools.title");
});

test("tools points to email as next", () => {
  const meta = buildMissionMeta(t, "tools");
  assert.equal(meta.index, 3);
  assert.equal(meta.nextTitle, "setup:tutorial.missions.email.title");
});

test("the email step is last and has no next", () => {
  const meta = buildMissionMeta(t, "email");
  assert.equal(meta.index, 4);
  assert.equal(meta.nextTitle, null);
});

test("frame labels expose brand, counter and up-next strings", () => {
  const labels = buildFrameLabels(t, "email");
  assert.equal(labels.brandLabel, "setup:tutorial.brand");
  assert.equal(labels.counterLabel, "setup:tutorial.counter");
  assert.equal(labels.upNextLabel, "setup:tutorial.upNext");
});

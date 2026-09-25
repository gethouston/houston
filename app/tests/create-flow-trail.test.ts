import assert from "node:assert/strict";
import test from "node:test";
import {
  type CreateFlowGates,
  createFlowShape,
  previousCreateFlowStep,
} from "../src/components/shell/create-agent-steps-model.ts";
import {
  currentWalkedStep,
  EMPTY_CREATE_FLOW_TRAIL,
  previousWalkedStep,
  reconcileWalkedTrail,
  shapeOffersHire,
  walkToStep,
} from "../src/components/shell/create-flow-trail.ts";

const GATES: CreateFlowGates = {
  canCreateAgent: true,
  canCreateTeam: true,
  canCopy: true,
};

const gates = (patch: Partial<CreateFlowGates> = {}): CreateFlowGates => ({
  ...GATES,
  ...patch,
});

test("an unwalked sheet stands on the shape's first screen, with no way back", () => {
  const shape = createFlowShape("choose", gates());
  assert.equal(currentWalkedStep(EMPTY_CREATE_FLOW_TRAIL, shape), "add");
  assert.equal(previousWalkedStep(EMPTY_CREATE_FLOW_TRAIL), null);
});

test("walking records the screen it left as well as the one it opened", () => {
  const shape = createFlowShape("choose", gates());
  const trail = walkToStep(EMPTY_CREATE_FLOW_TRAIL, shape, "choose");
  assert.deepEqual([...trail], ["add", "choose"]);
  assert.equal(currentWalkedStep(trail, shape), "choose");
  assert.equal(previousWalkedStep(trail), "add");
});

test("walking back to a screen already behind you rewinds to it", () => {
  const shape = createFlowShape("choose", gates());
  let trail = walkToStep(EMPTY_CREATE_FLOW_TRAIL, shape, "choose");
  trail = walkToStep(trail, shape, "context");
  trail = walkToStep(trail, shape, "role");
  // The customize recap's "change this answer" jumps straight back.
  trail = walkToStep(trail, shape, "context");
  assert.deepEqual([...trail], ["add", "choose", "context"]);
  assert.equal(previousWalkedStep(trail), "choose");
});

test("gates settling the hire path away returns to the new first screen and clears the answers", () => {
  const before = createFlowShape("choose", gates());
  let trail = walkToStep(EMPTY_CREATE_FLOW_TRAIL, before, "choose");
  trail = walkToStep(trail, before, "context");

  // The capabilities read lands: this user is a plain org member after all.
  const after = createFlowShape("choose", gates({ canCreateAgent: false }));
  const settled = reconcileWalkedTrail(trail, after);
  assert.equal(currentWalkedStep(settled.trail, after), after.first);
  assert.equal(after.first, "team");
  assert.deepEqual([...settled.dropped], ["add", "choose", "context"]);
  // The hire path is gone, which is what takes its answers with it.
  assert.equal(shapeOffersHire(after), false);
  assert.equal(shapeOffersHire(before), true);
});

test("gates closing the hire path mid-brief land the user on the team form", () => {
  // The door said "agent", so the run opened on the hire path's own screens.
  const before = createFlowShape("agent", gates());
  let trail = walkToStep(EMPTY_CREATE_FLOW_TRAIL, before, "context");
  trail = walkToStep(trail, before, "role");
  assert.deepEqual([...trail], ["choose", "context", "role"]);

  const after = createFlowShape("agent", gates({ canCreateAgent: false }));
  const settled = reconcileWalkedTrail(trail, after);
  // A trail that no longer even starts where the run opens goes whole.
  assert.deepEqual([...settled.trail], []);
  assert.deepEqual([...settled.dropped], ["choose", "context", "role"]);
  assert.equal(currentWalkedStep(settled.trail, after), "team");
  assert.equal(shapeOffersHire(after), false);
});

test("a run with no screen at all stands nowhere and keeps no trail", () => {
  const before = createFlowShape("agent", gates());
  const trail = walkToStep(EMPTY_CREATE_FLOW_TRAIL, before, "context");

  const shut = gates({ canCreateAgent: false, canCreateTeam: false });
  const after = createFlowShape("agent", shut);
  const settled = reconcileWalkedTrail(trail, after);
  assert.deepEqual([...settled.trail], []);
  assert.deepEqual([...settled.dropped], [...trail]);
  assert.equal(currentWalkedStep(settled.trail, after), null);
  assert.equal(shapeOffersHire(after), false);
});

test("back walks the trail the user actually walked, not the shape as it stands now", () => {
  // Nothing to copy yet, so the hire path opened straight on the industry.
  const before = createFlowShape("choose", gates({ canCopy: false }));
  const trail = walkToStep(EMPTY_CREATE_FLOW_TRAIL, before, "context");
  assert.deepEqual([...trail], ["add", "context"]);

  // A first agent lands while the sheet is open: "Hire or copy?" now exists,
  // but the user never saw it, so back still goes where they came from.
  const after = createFlowShape("choose", gates());
  const settled = reconcileWalkedTrail(trail, after);
  assert.equal(settled.trail, trail);
  assert.equal(previousWalkedStep(settled.trail), "add");
  // The shape as it stands now would send them to that unseen screen.
  assert.equal(previousCreateFlowStep("context", after), "choose");
});

test("a trail the new shape still contains is left untouched", () => {
  const shape = createFlowShape("choose", gates());
  let trail = walkToStep(EMPTY_CREATE_FLOW_TRAIL, shape, "choose");
  trail = walkToStep(trail, shape, "copy");
  const settled = reconcileWalkedTrail(trail, shape);
  assert.equal(settled.trail, trail);
  assert.equal(settled.dropped.length, 0);
});

test("losing the last copyable agent takes the copy wizard out of the trail", () => {
  const before = createFlowShape("agent", gates());
  const trail = walkToStep(EMPTY_CREATE_FLOW_TRAIL, before, "copy");
  assert.deepEqual([...trail], ["choose", "copy"]);

  const after = createFlowShape("agent", gates({ canCopy: false }));
  const settled = reconcileWalkedTrail(trail, after);
  assert.equal(currentWalkedStep(settled.trail, after), "context");
  assert.deepEqual([...settled.dropped], ["choose", "copy"]);
});

test("gates closing every choice drop a trail walked before they settled", () => {
  const before = createFlowShape("choose", gates());
  const trail = walkToStep(EMPTY_CREATE_FLOW_TRAIL, before, "team");
  const after = createFlowShape(
    "choose",
    gates({ canCopy: false, canCreateTeam: false }),
  );
  const settled = reconcileWalkedTrail(trail, after);
  assert.equal(currentWalkedStep(settled.trail, after), "context");
  assert.deepEqual([...settled.dropped], ["add", "team"]);
});

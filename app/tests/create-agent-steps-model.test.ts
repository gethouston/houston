import assert from "node:assert/strict";
import test from "node:test";
import {
  type CreateFlowGates,
  createFlowShape,
  createFlowStepDirection,
  createFlowStepSize,
  GUIDED_CREATE_AGENT_STEPS,
  guidedStepIndex,
  hasFlowPrimary,
  isGuidedCreateAgentStep,
  nextCreateAgentStep,
  offersChoiceStep,
  previousCreateFlowStep,
} from "../src/components/shell/create-agent-steps-model.ts";

const GATES: CreateFlowGates = {
  canCreateAgent: true,
  canCreateTeam: true,
  canCopy: true,
};

const gates = (patch: Partial<CreateFlowGates> = {}): CreateFlowGates => ({
  ...GATES,
  ...patch,
});

test("the rail's + opens on what the user can add", () => {
  const shape = createFlowShape("choose", gates());
  assert.equal(shape.first, "add");
  assert.equal(shape.offersAdd, true);
});

test("a caller that already knows lands on that path's own first screen", () => {
  assert.equal(createFlowShape("agent", gates()).first, "choose");
  assert.equal(createFlowShape("team", gates()).first, "team");
  // The opening choice belongs to the door that has one.
  assert.equal(createFlowShape("agent", gates()).offersAdd, false);
  assert.equal(createFlowShape("team", gates()).offersAdd, false);
});

test("a choice with one answer is not a screen", () => {
  // A plain member on a C13 host may create teams but not agents.
  const teamOnly = createFlowShape("choose", gates({ canCreateAgent: false }));
  assert.equal(teamOnly.first, "team");
  assert.equal(teamOnly.offersAdd, false);

  const agentOnly = createFlowShape("choose", gates({ canCreateTeam: false }));
  assert.equal(agentOnly.first, "choose");
  assert.equal(agentOnly.offersAdd, false);
});

test("a door onto a path the gates closed falls to the one they allow", () => {
  // The sheet opens optimistic and the capabilities land under it, so a caller
  // that asked for the hire path must not walk the brief into a refusal.
  assert.equal(
    createFlowShape("agent", gates({ canCreateAgent: false })).first,
    "team",
  );
  assert.equal(
    createFlowShape("team", gates({ canCreateTeam: false })).first,
    "choose",
  );
  assert.equal(
    createFlowShape("team", gates({ canCreateTeam: false, canCopy: false }))
      .first,
    "context",
  );
});

test("a run neither gate allows has no screen at all", () => {
  const shut = gates({ canCreateAgent: false, canCreateTeam: false });
  for (const door of ["choose", "agent", "team"] as const) {
    const shape = createFlowShape(door, shut);
    assert.equal(shape.first, null);
    assert.equal(shape.offersAdd, false);
  }
});

test("nothing to copy opens straight on the industry", () => {
  const shape = createFlowShape("agent", gates({ canCopy: false }));
  assert.equal(shape.first, "context");
  assert.equal(shape.offersChoice, false);
});

test("the choice of how to start is offered only when there is something to copy", () => {
  assert.equal(offersChoiceStep(gates()), true);
  assert.equal(offersChoiceStep(gates({ canCopy: false })), false);
});

test("the guided setup runs in order", () => {
  assert.equal(nextCreateAgentStep("context"), "role");
  assert.equal(nextCreateAgentStep("role"), "customize");
});

test("every screen answered by its own controls stays put", () => {
  for (const step of ["add", "choose", "copy", "team", "customize"] as const) {
    assert.equal(nextCreateAgentStep(step), step);
  }
});

test("back walks up one level of the tree", () => {
  const shape = createFlowShape("choose", gates());
  assert.equal(previousCreateFlowStep("customize", shape), "role");
  assert.equal(previousCreateFlowStep("role", shape), "context");
  assert.equal(previousCreateFlowStep("context", shape), "choose");
  assert.equal(previousCreateFlowStep("copy", shape), "choose");
  assert.equal(previousCreateFlowStep("choose", shape), "add");
  assert.equal(previousCreateFlowStep("team", shape), "add");
});

test("the screen the sheet opened on is the way out", () => {
  const shape = createFlowShape("choose", gates());
  assert.equal(previousCreateFlowStep("add", shape), "add");

  const team = createFlowShape("team", gates());
  assert.equal(previousCreateFlowStep("team", team), "team");

  const noCopy = createFlowShape("agent", gates({ canCopy: false }));
  assert.equal(previousCreateFlowStep("context", noCopy), "context");
  assert.equal(previousCreateFlowStep("role", noCopy), "context");
});

test("without the hire/copy choice the industry falls back to the opening one", () => {
  const shape = createFlowShape("choose", gates({ canCopy: false }));
  assert.equal(shape.first, "add");
  assert.equal(previousCreateFlowStep("context", shape), "add");
});

test("the guided steps are the ones the progress indicator renders", () => {
  assert.deepEqual(
    [...GUIDED_CREATE_AGENT_STEPS],
    ["context", "role", "customize"],
  );
  for (const [index, step] of GUIDED_CREATE_AGENT_STEPS.entries()) {
    assert.equal(isGuidedCreateAgentStep(step), true);
    assert.equal(guidedStepIndex(step), index);
  }
  for (const step of ["add", "choose", "copy", "team"] as const) {
    assert.equal(isGuidedCreateAgentStep(step), false);
  }
});

test("a move deeper enters forward, and a move back rewinds", () => {
  assert.equal(createFlowStepDirection("add", "choose"), "forward");
  assert.equal(createFlowStepDirection("add", "team"), "forward");
  assert.equal(createFlowStepDirection("team", "add"), "back");
  assert.equal(createFlowStepDirection("choose", "context"), "forward");
  assert.equal(createFlowStepDirection("context", "choose"), "back");
  assert.equal(createFlowStepDirection("role", "customize"), "forward");
  assert.equal(createFlowStepDirection("customize", "role"), "back");
});

test("both doors off the choice hang at the same depth", () => {
  assert.equal(createFlowStepDirection("choose", "copy"), "forward");
  assert.equal(createFlowStepDirection("copy", "choose"), "back");
  assert.equal(createFlowStepDirection("copy", "context"), "forward");
  // Re-entering the step you are already on must not look like a rewind.
  assert.equal(createFlowStepDirection("role", "role"), "forward");
});

test("a step that asks one short thing wears the hand-sized frame", () => {
  // The defect this map ends: a two-option question stretched down a 900px,
  // 85dvh sheet with the cards floating in the middle of it.
  for (const step of ["add", "choose", "team", "customize"] as const) {
    assert.equal(createFlowStepSize(step), "compact");
  }
});

test("only the catalogs and the copy wizard take the tall frame", () => {
  // A hundred and eighty chips, and a list of the user's own agents, are
  // scanning work; nothing else in the flow is.
  for (const step of ["context", "role", "copy"] as const) {
    assert.equal(createFlowStepSize(step), "wide");
  }
});

test("only a screen that ASKS for something carries a bottom bar", () => {
  // A choice is answered by pressing one of the things on offer; a bar under
  // it would be a second way to say the same thing, disabled until it is not.
  assert.equal(hasFlowPrimary("add", "source"), false);
  assert.equal(hasFlowPrimary("choose", "source"), false);
  assert.equal(hasFlowPrimary("context", "source"), false);
  assert.equal(hasFlowPrimary("role", "source"), false);
  assert.equal(hasFlowPrimary("customize", "source"), true);
  assert.equal(hasFlowPrimary("team", "source"), true);
  // The copy wizard's source list is a choice too; everything after it walks.
  assert.equal(hasFlowPrimary("copy", "source"), false);
  for (const inner of ["instructions", "routines", "skills", "name"] as const) {
    assert.equal(hasFlowPrimary("copy", inner), true);
  }
});

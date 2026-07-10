import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  advanceConnect,
  advanceSignin,
  answerWithOption,
  answerWithText,
  type ChatInteractionStep,
  canAdvanceQuestion,
  canGoForward,
  defaultProgress,
  draftFor,
  goBack,
  goForward,
  hasSelectableOptions,
  initialStepperState,
  isLastStep,
  normalizeAnswer,
  optionLabel,
  selectedOptionId,
  setDraft,
  skipStep,
  toCompletedAnswers,
} from "../src/interaction-card-logic.ts";

const Q1: ChatInteractionStep = {
  kind: "question",
  id: "q1",
  question: "Who is it for?",
  options: [
    { id: "o1", label: "John" },
    { id: "o2", label: "Jane" },
  ],
};
const Q2: ChatInteractionStep = {
  kind: "question",
  id: "q2",
  question: "What should it say?",
};
const CONNECT: ChatInteractionStep = {
  kind: "connect",
  id: "c1",
  toolkit: "gmail",
  reason: "to send the email",
};
const SIGNIN: ChatInteractionStep = {
  kind: "signin",
  id: "s1",
  reason: "to use connected apps",
};

describe("hasSelectableOptions", () => {
  it("is true when the agent offered concrete choices", () => {
    assert.equal(hasSelectableOptions([{ id: "a", label: "Yes" }]), true);
  });

  it("is false for an empty or missing option list (free-text only)", () => {
    assert.equal(hasSelectableOptions([]), false);
    assert.equal(hasSelectableOptions(undefined), false);
  });
});

describe("normalizeAnswer", () => {
  it("trims a typed answer", () => {
    assert.equal(normalizeAnswer("  send it  "), "send it");
  });

  it("blocks a whitespace-only answer from being sent", () => {
    assert.equal(normalizeAnswer("   "), null);
    assert.equal(normalizeAnswer(""), null);
  });
});

describe("optionLabel", () => {
  it("resolves a known option id", () => {
    assert.equal(optionLabel(Q1, "o2"), "Jane");
  });

  it("returns null for an unknown id or a connect step", () => {
    assert.equal(optionLabel(Q1, "gone"), null);
    assert.equal(optionLabel(CONNECT, "o1"), null);
  });
});

describe("isLastStep", () => {
  it("is true only at the final index", () => {
    assert.equal(isLastStep(0, 1), true);
    assert.equal(isLastStep(1, 3), false);
    assert.equal(isLastStep(2, 3), true);
  });
});

describe("defaultProgress", () => {
  it("formats 'Step <current> of <total>'", () => {
    assert.equal(defaultProgress(1, 3), "Step 1 of 3");
  });
});

describe("canAdvanceQuestion", () => {
  it("is true with a selected option", () => {
    assert.equal(canAdvanceQuestion(true, ""), true);
  });

  it("is true with typed text", () => {
    assert.equal(canAdvanceQuestion(false, "hi"), true);
  });

  it("is false with neither", () => {
    assert.equal(canAdvanceQuestion(false, "  "), false);
  });
});

describe("answerWithOption", () => {
  it("commits the chosen label and advances", () => {
    const t = answerWithOption(initialStepperState(), [Q1, Q2], "o1");
    assert.equal(t.completed, undefined);
    assert.equal(t.state.current, 1);
    assert.deepEqual(t.state.answers.q1, { answer: "John", optionId: "o1" });
  });

  it("completes when the option step is the last step", () => {
    const t = answerWithOption(initialStepperState(), [Q1], "o2");
    assert.deepEqual(t.completed, [
      { stepId: "q1", question: "Who is it for?", answer: "Jane" },
    ]);
  });

  it("ignores an unknown option id", () => {
    const s = initialStepperState();
    assert.equal(answerWithOption(s, [Q1], "nope").state, s);
  });
});

describe("answerWithText", () => {
  it("commits the trimmed draft and advances", () => {
    let s = initialStepperState();
    s = setDraft(s, "q1", "  in person  ");
    const t = answerWithText(s, [Q1, Q2]);
    assert.equal(t.state.current, 1);
    assert.deepEqual(t.state.answers.q1, {
      answer: "in person",
      optionId: null,
    });
  });

  it("does nothing when the draft is empty and no option is selected", () => {
    const s = initialStepperState();
    const t = answerWithText(s, [Q1, Q2]);
    assert.equal(t.state.current, 0);
    assert.equal(t.state.answers.q1, undefined);
  });

  it("advances on an already-selected option when the draft is empty", () => {
    // Select o1 (advances to q2), go back to q1, then press send with no text.
    let s = answerWithOption(initialStepperState(), [Q1, Q2], "o1").state;
    s = goBack(s);
    const t = answerWithText(s, [Q1, Q2]);
    assert.equal(t.state.current, 1);
  });
});

describe("stepper flow: question, question, connect", () => {
  const steps = [Q1, Q2, CONNECT];

  it("walks all steps and completes with question answers only", () => {
    let s = answerWithOption(initialStepperState(), steps, "o1").state;
    s = setDraft(s, "q2", "Running late");
    const afterQ2 = answerWithText(s, steps);
    assert.equal(afterQ2.completed, undefined);
    assert.equal(afterQ2.state.current, 2); // now on the connect step

    const done = advanceConnect(afterQ2.state, steps);
    assert.deepEqual(done.completed, [
      { stepId: "q1", question: "Who is it for?", answer: "John" },
      { stepId: "q2", question: "What should it say?", answer: "Running late" },
    ]);
  });

  it("back revisits an answered question and pre-selects its option", () => {
    let s = answerWithOption(initialStepperState(), steps, "o2").state;
    s = goBack(s);
    assert.equal(s.current, 0);
    assert.equal(selectedOptionId(s, "q1"), "o2");
  });

  it("re-answering a revisited question replaces the prior answer", () => {
    let s = answerWithOption(initialStepperState(), steps, "o1").state;
    s = goBack(s);
    s = answerWithOption(s, steps, "o2").state;
    assert.deepEqual(s.answers.q1, { answer: "Jane", optionId: "o2" });
    assert.equal(s.current, 1);
  });
});

describe("skipStep", () => {
  const steps = [Q1, Q2, CONNECT];

  it("skips a middle question and omits it from the completed answers", () => {
    let s = skipStep(initialStepperState(), steps).state; // skip Q1 -> Q2
    assert.equal(s.current, 1);
    assert.equal(s.answers.q1, undefined);
    s = setDraft(s, "q2", "Running late");
    s = answerWithText(s, steps).state; // answer Q2 -> connect
    const done = advanceConnect(s, steps);
    assert.deepEqual(done.completed, [
      { stepId: "q2", question: "What should it say?", answer: "Running late" },
    ]);
  });

  it("skipping the LAST question still completes with the prior answers", () => {
    const s = answerWithOption(initialStepperState(), [Q1, Q2], "o1").state;
    assert.equal(s.current, 1); // on Q2, the last step
    const done = skipStep(s, [Q1, Q2]);
    assert.deepEqual(done.completed, [
      { stepId: "q1", question: "Who is it for?", answer: "John" },
    ]);
  });

  it("skips a connect step, advancing the frontier without an answer", () => {
    const s = answerWithOption(
      initialStepperState(),
      [Q1, CONNECT, SIGNIN],
      "o1",
    ).state;
    assert.equal(s.current, 1); // on the connect step
    const t = skipStep(s, [Q1, CONNECT, SIGNIN]);
    assert.equal(t.completed, undefined);
    assert.equal(t.state.current, 2); // -> signin step
    assert.equal(t.state.reached, 2); // frontier advanced (Back/Forward work)
  });

  it("skipping the LAST connect step completes with the prior answers", () => {
    const s = answerWithOption(
      initialStepperState(),
      [Q1, CONNECT],
      "o1",
    ).state;
    assert.equal(s.current, 1); // on the connect step, the last step
    const done = skipStep(s, [Q1, CONNECT]);
    assert.deepEqual(done.completed, [
      { stepId: "q1", question: "Who is it for?", answer: "John" },
    ]);
  });

  it("skipping a lone signin step completes with no answers", () => {
    const done = skipStep(initialStepperState(), [SIGNIN]);
    assert.deepEqual(done.completed, []);
  });
});

describe("stepper flow: question, signin, connect", () => {
  const steps = [Q2, SIGNIN, CONNECT];

  it("walks all steps and completes with question answers only", () => {
    // Answer Q2, advance the signin step, then the connect step.
    let s = setDraft(initialStepperState(), "q2", "Running late");
    s = answerWithText(s, steps).state; // -> signin step (index 1)
    assert.equal(s.current, 1);

    const afterSignin = advanceSignin(s, steps);
    assert.equal(afterSignin.completed, undefined);
    assert.equal(afterSignin.state.current, 2); // now on the connect step

    // Signin contributes no answer text; only question answers complete.
    const done = advanceConnect(afterSignin.state, steps);
    assert.deepEqual(done.completed, [
      { stepId: "q2", question: "What should it say?", answer: "Running late" },
    ]);
  });

  it("advances the progress counter across the signin step", () => {
    // "N of X" is derived from current+1 / total; signin counts like any step.
    assert.equal(defaultProgress(2, steps.length), "Step 2 of 3");
  });
});

describe("advanceSignin", () => {
  it("completes when the signin step is the last step", () => {
    const s = setDraft(initialStepperState(), "q2", "hi");
    const afterQ = answerWithText(s, [Q2, SIGNIN]).state; // -> signin (last)
    const done = advanceSignin(afterQ, [Q2, SIGNIN]);
    assert.deepEqual(done.completed, [
      { stepId: "q2", question: "What should it say?", answer: "hi" },
    ]);
  });

  it("contributes no answer for a signin-only sequence", () => {
    const done = advanceSignin(initialStepperState(), [SIGNIN]);
    assert.deepEqual(done.completed, []);
  });
});

describe("optionLabel on a signin step", () => {
  it("returns null (signin steps carry no options)", () => {
    assert.equal(optionLabel(SIGNIN, "o1"), null);
  });
});

describe("forward navigation past a completed signin step", () => {
  // Mirror of the connect regression: [question, signin, connect]. Signing in
  // advances to connect; a revisited signin step never re-fires onSignedIn, so
  // Back onto it strands the sequence unless the forward affordance is offered.
  const steps = [Q2, SIGNIN, CONNECT];

  it("lets the user return to a completed signin step and still finish", () => {
    let s = setDraft(initialStepperState(), "q2", "Running late");
    s = answerWithText(s, steps).state; // -> signin (index 1)
    s = advanceSignin(s, steps).state; // signed in -> connect (index 2)
    s = goBack(s); // Back onto the completed signin step (index 1)
    assert.equal(s.current, 1);

    // Already signed in: its card never re-fires onSignedIn, so the stepper's
    // own forward affordance is the only way onward.
    assert.equal(canGoForward(s), true);
    s = goForward(s); // -> connect (index 2)
    assert.equal(s.current, 2);

    const done = advanceConnect(s, steps); // connected -> complete
    assert.deepEqual(done.completed, [
      { stepId: "q2", question: "What should it say?", answer: "Running late" },
    ]);
  });
});

describe("goBack", () => {
  it("never goes below the first step", () => {
    assert.equal(goBack(initialStepperState()).current, 0);
  });
});

describe("forward navigation past a completed step", () => {
  const CONNECT_B: ChatInteractionStep = {
    kind: "connect",
    id: "c2",
    toolkit: "slack",
  };
  // Regression: [question, connect A, connect B]. Connecting A advances to B,
  // a non-last connect step never fires onConnected on revisit, so without a
  // forward path pressing Back onto A strands the sequence and onComplete is
  // unreachable.
  const steps = [Q2, CONNECT, CONNECT_B];

  it("lets the user return to a completed connect step and still finish", () => {
    // Answer Q2, connect A (advance to B), then Back onto the already-connected A.
    let s = setDraft(initialStepperState(), "q2", "Running late");
    s = answerWithText(s, steps).state; // -> connect A (index 1)
    s = advanceConnect(s, steps).state; // A connected -> connect B (index 2)
    s = goBack(s); // Back onto the completed connect A (index 1)
    assert.equal(s.current, 1);

    // A is already connected: its card never re-fires onConnected, so the only
    // way forward is the stepper's own forward affordance.
    assert.equal(canGoForward(s), true);
    s = goForward(s); // -> connect B (index 2)
    assert.equal(s.current, 2);

    const done = advanceConnect(s, steps); // B connected -> complete
    assert.deepEqual(done.completed, [
      { stepId: "q2", question: "What should it say?", answer: "Running late" },
    ]);
  });

  it("has no forward affordance at the frontier", () => {
    let s = setDraft(initialStepperState(), "q2", "hi");
    s = answerWithText(s, steps).state; // on connect A, the furthest reached
    assert.equal(canGoForward(s), false);
    assert.equal(goForward(s).current, s.current);
  });
});

describe("drafts", () => {
  it("restores a typed draft on revisit and clears it on option pick", () => {
    let s = setDraft(initialStepperState(), "q1", "typed");
    assert.equal(draftFor(s, "q1"), "typed");
    s = answerWithOption(s, [Q1, Q2], "o1").state;
    assert.equal(draftFor(s, "q1"), ""); // option pick clears the draft
  });
});

describe("toCompletedAnswers", () => {
  it("includes only answered question steps, in order", () => {
    const answers = {
      q2: { answer: "hi", optionId: null },
      q1: { answer: "John", optionId: "o1" },
    };
    assert.deepEqual(toCompletedAnswers([Q1, Q2, CONNECT], answers), [
      { stepId: "q1", question: "Who is it for?", answer: "John" },
      { stepId: "q2", question: "What should it say?", answer: "hi" },
    ]);
  });
});

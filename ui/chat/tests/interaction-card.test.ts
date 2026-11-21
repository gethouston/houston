import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  advanceConnect,
  advanceCredential,
  advanceCustom,
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
const Q_BRANDED: ChatInteractionStep = {
  kind: "question",
  id: "qb",
  question: "Send this draft?",
  options: [
    { id: "yes", label: "Send it" },
    { id: "no", label: "Hold off" },
  ],
  brand: {
    name: "Gmail",
    logoUrl: "data:image/png;base64,AAAA",
  },
};

const CREDENTIAL: ChatInteractionStep = {
  kind: "credential",
  id: "k1",
  toolkit: "acme",
  reason: "to reach the Acme API",
};

const CUSTOM: ChatInteractionStep = {
  kind: "custom",
  id: "x1",
  title: "Pick a template",
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

describe("InlineTextRow send guard", () => {
  const rowSend = (value: string): string | null => normalizeAnswer(value);

  it("stays disabled for empty or whitespace-only text", () => {
    assert.equal(rowSend(""), null);
    assert.equal(rowSend("    "), null);
    assert.equal(rowSend("\n\t"), null);
  });

  it("submits the trimmed instruction once there is content", () => {
    assert.equal(rowSend("  use my work account  "), "use my work account");
    assert.equal(rowSend("read it from env"), "read it from env");
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
  it("formats '<current> of <total>'", () => {
    assert.equal(defaultProgress(1, 3), "1 of 3");
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
      {
        stepId: "q1",
        question: "Who is it for?",
        answer: "Jane",
        source: "option",
        optionId: "o2",
      },
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
    assert.equal(afterQ2.state.current, 2);

    const done = advanceConnect(afterQ2.state, steps);
    assert.deepEqual(done.completed, [
      {
        stepId: "q1",
        question: "Who is it for?",
        answer: "John",
        source: "option",
        optionId: "o1",
      },
      {
        stepId: "q2",
        question: "What should it say?",
        answer: "Running late",
        source: "text",
      },
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
    let s = skipStep(initialStepperState(), steps).state;
    assert.equal(s.current, 1);
    assert.equal(s.answers.q1, undefined);
    s = setDraft(s, "q2", "Running late");
    s = answerWithText(s, steps).state;
    const done = advanceConnect(s, steps);
    assert.deepEqual(done.completed, [
      {
        stepId: "q2",
        question: "What should it say?",
        answer: "Running late",
        source: "text",
      },
    ]);
  });

  it("skipping the LAST question still completes with the prior answers", () => {
    const s = answerWithOption(initialStepperState(), [Q1, Q2], "o1").state;
    assert.equal(s.current, 1);
    const done = skipStep(s, [Q1, Q2]);
    assert.deepEqual(done.completed, [
      {
        stepId: "q1",
        question: "Who is it for?",
        answer: "John",
        source: "option",
        optionId: "o1",
      },
    ]);
  });

  it("skips a connect step, advancing the frontier without an answer", () => {
    const s = answerWithOption(
      initialStepperState(),
      [Q1, CONNECT, SIGNIN],
      "o1",
    ).state;
    assert.equal(s.current, 1);
    const t = skipStep(s, [Q1, CONNECT, SIGNIN]);
    assert.equal(t.completed, undefined);
    assert.equal(t.state.current, 2);
    assert.equal(t.state.reached, 2);
  });

  it("skipping the LAST connect step completes with the prior answers", () => {
    const s = answerWithOption(
      initialStepperState(),
      [Q1, CONNECT],
      "o1",
    ).state;
    assert.equal(s.current, 1);
    const done = skipStep(s, [Q1, CONNECT]);
    assert.deepEqual(done.completed, [
      {
        stepId: "q1",
        question: "Who is it for?",
        answer: "John",
        source: "option",
        optionId: "o1",
      },
    ]);
  });

  it("skipping a lone signin step completes with no answers", () => {
    const done = skipStep(initialStepperState(), [SIGNIN]);
    assert.deepEqual(done.completed, []);
  });

  it("skipping a LONE question completes with no answers (a consumer can read [] as decline)", () => {
    const done = skipStep(initialStepperState(), [Q1]);
    assert.deepEqual(done.completed, []);
  });
});

describe("stepper flow: question, signin, connect", () => {
  const steps = [Q2, SIGNIN, CONNECT];

  it("walks all steps and completes with question answers only", () => {
    let s = setDraft(initialStepperState(), "q2", "Running late");
    s = answerWithText(s, steps).state;
    assert.equal(s.current, 1);

    const afterSignin = advanceSignin(s, steps);
    assert.equal(afterSignin.completed, undefined);
    assert.equal(afterSignin.state.current, 2);

    const done = advanceConnect(afterSignin.state, steps);
    assert.deepEqual(done.completed, [
      {
        stepId: "q2",
        question: "What should it say?",
        answer: "Running late",
        source: "text",
      },
    ]);
  });

  it("advances the progress counter across the signin step", () => {
    assert.equal(defaultProgress(2, steps.length), "2 of 3");
  });
});

describe("advanceSignin", () => {
  it("completes when the signin step is the last step", () => {
    const s = setDraft(initialStepperState(), "q2", "hi");
    const afterQ = answerWithText(s, [Q2, SIGNIN]).state;
    const done = advanceSignin(afterQ, [Q2, SIGNIN]);
    assert.deepEqual(done.completed, [
      {
        stepId: "q2",
        question: "What should it say?",
        answer: "hi",
        source: "text",
      },
    ]);
  });

  it("contributes no answer for a signin-only sequence", () => {
    const done = advanceSignin(initialStepperState(), [SIGNIN]);
    assert.deepEqual(done.completed, []);
  });
});

describe("advanceCredential", () => {
  it("completes when the credential step is the last step", () => {
    const s = setDraft(initialStepperState(), "q2", "hi");
    const afterQ = answerWithText(s, [Q2, CREDENTIAL]).state;
    const done = advanceCredential(afterQ, [Q2, CREDENTIAL]);
    assert.deepEqual(done.completed, [
      {
        stepId: "q2",
        question: "What should it say?",
        answer: "hi",
        source: "text",
      },
    ]);
  });

  it("contributes no answer for a credential-only sequence", () => {
    const done = advanceCredential(initialStepperState(), [CREDENTIAL]);
    assert.deepEqual(done.completed, []);
  });
});

describe("advanceCustom", () => {
  it("advances a non-terminal custom step to the next step", () => {
    const t = advanceCustom(initialStepperState(), [CUSTOM, Q2]);
    assert.equal(t.completed, undefined);
    assert.equal(t.state.current, 1);
    assert.equal(t.state.reached, 1);
  });

  it("completes when the custom step is the last step", () => {
    const s = setDraft(initialStepperState(), "q2", "hi");
    const afterQ = answerWithText(s, [Q2, CUSTOM]).state;
    const done = advanceCustom(afterQ, [Q2, CUSTOM]);
    assert.deepEqual(done.completed, [
      {
        stepId: "q2",
        question: "What should it say?",
        answer: "hi",
        source: "text",
      },
    ]);
  });

  it("contributes no answer for a custom-only sequence", () => {
    const done = advanceCustom(initialStepperState(), [CUSTOM]);
    assert.deepEqual(done.completed, []);
  });
});

describe("optionLabel on a custom step", () => {
  it("returns null (custom steps carry no options)", () => {
    assert.equal(optionLabel(CUSTOM, "o1"), null);
  });
});

describe("optionLabel on a signin step", () => {
  it("returns null (signin steps carry no options)", () => {
    assert.equal(optionLabel(SIGNIN, "o1"), null);
  });
});

describe("forward navigation past a completed signin step", () => {
  const steps = [Q2, SIGNIN, CONNECT];

  it("lets the user return to a completed signin step and still finish", () => {
    let s = setDraft(initialStepperState(), "q2", "Running late");
    s = answerWithText(s, steps).state;
    s = advanceSignin(s, steps).state;
    s = goBack(s);
    assert.equal(s.current, 1);

    assert.equal(canGoForward(s), true);
    s = goForward(s);
    assert.equal(s.current, 2);

    const done = advanceConnect(s, steps);
    assert.deepEqual(done.completed, [
      {
        stepId: "q2",
        question: "What should it say?",
        answer: "Running late",
        source: "text",
      },
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
  const steps = [Q2, CONNECT, CONNECT_B];

  it("lets the user return to a completed connect step and still finish", () => {
    let s = setDraft(initialStepperState(), "q2", "Running late");
    s = answerWithText(s, steps).state;
    s = advanceConnect(s, steps).state;
    s = goBack(s);
    assert.equal(s.current, 1);

    assert.equal(canGoForward(s), true);
    s = goForward(s);
    assert.equal(s.current, 2);

    const done = advanceConnect(s, steps);
    assert.deepEqual(done.completed, [
      {
        stepId: "q2",
        question: "What should it say?",
        answer: "Running late",
        source: "text",
      },
    ]);
  });

  it("has no forward affordance at the frontier", () => {
    let s = setDraft(initialStepperState(), "q2", "hi");
    s = answerWithText(s, steps).state;
    assert.equal(canGoForward(s), false);
    assert.equal(goForward(s).current, s.current);
  });
});

describe("reconsider a skipped step", () => {
  const CONNECT_B: ChatInteractionStep = {
    kind: "connect",
    id: "c2",
    toolkit: "slack",
  };
  const steps = [Q2, CONNECT, CONNECT_B];

  it("skip a connect then Back leaves it revisitable and re-connectable", () => {
    let s = setDraft(initialStepperState(), "q2", "Running late");
    s = answerWithText(s, steps).state;
    s = skipStep(s, steps).state;
    assert.equal(s.current, 2);
    assert.equal(s.reached, 2);

    s = goBack(s);
    assert.equal(s.current, 1);
    assert.equal(canGoForward(s), true);
    s = advanceConnect(s, steps).state;
    assert.equal(s.current, 2);

    const done = advanceConnect(s, steps);
    assert.deepEqual(done.completed, [
      {
        stepId: "q2",
        question: "What should it say?",
        answer: "Running late",
        source: "text",
      },
    ]);
  });

  it("skip a connect, Back, then skip again stays idempotent (still index-stable)", () => {
    let s = setDraft(initialStepperState(), "q2", "hi");
    s = answerWithText(s, steps).state;
    s = skipStep(s, steps).state;
    s = goBack(s);
    s = goForward(s);
    assert.equal(s.current, 2);
    assert.equal(s.reached, 2);
  });

  it("skip a signin then Back leaves it revisitable and re-signinable", () => {
    const flow = [SIGNIN, CONNECT];
    let s = skipStep(initialStepperState(), flow).state;
    assert.equal(s.current, 1);
    s = goBack(s);
    assert.equal(s.current, 0);
    assert.equal(canGoForward(s), true);
    s = advanceSignin(s, flow).state;
    assert.equal(s.current, 1);
  });
});

describe("drafts", () => {
  it("restores a typed draft on revisit and clears it on option pick", () => {
    let s = setDraft(initialStepperState(), "q1", "typed");
    assert.equal(draftFor(s, "q1"), "typed");
    s = answerWithOption(s, [Q1, Q2], "o1").state;
    assert.equal(draftFor(s, "q1"), "");
  });
});

describe("toCompletedAnswers", () => {
  it("includes only answered question steps, in order", () => {
    const answers = {
      q2: { answer: "hi", optionId: null },
      q1: { answer: "John", optionId: "o1" },
    };
    assert.deepEqual(toCompletedAnswers([Q1, Q2, CONNECT], answers), [
      {
        stepId: "q1",
        question: "Who is it for?",
        answer: "John",
        source: "option",
        optionId: "o1",
      },
      {
        stepId: "q2",
        question: "What should it say?",
        answer: "hi",
        source: "text",
      },
    ]);
  });

  it("ignores connect steps (they produce no question answer)", () => {
    const answers = { q1: { answer: "John", optionId: "o1" } };
    assert.deepEqual(toCompletedAnswers([Q1, CONNECT], answers), [
      {
        stepId: "q1",
        question: "Who is it for?",
        answer: "John",
        source: "option",
        optionId: "o1",
      },
    ]);
  });
});

describe("branded question", () => {
  it("answers and completes like a plain question, brand and all", () => {
    const t = answerWithOption(initialStepperState(), [Q_BRANDED], "yes");
    assert.deepEqual(t.completed, [
      {
        stepId: "qb",
        question: "Send this draft?",
        answer: "Send it",
        source: "option",
        optionId: "yes",
      },
    ]);
  });

  it("resolves its option labels (brand does not shadow options)", () => {
    assert.equal(optionLabel(Q_BRANDED, "no"), "Hold off");
    assert.equal(hasSelectableOptions(Q_BRANDED.options), true);
  });
});

describe("skip after an earlier answer", () => {
  const steps = [Q1, Q2, CONNECT];

  it("drops the answer committed on an earlier visit to the skipped step", () => {
    let s = answerWithOption(initialStepperState(), steps, "o1").state;
    s = goBack(s);
    s = skipStep(s, steps).state;
    assert.equal(s.answers.q1, undefined);
    assert.deepEqual(toCompletedAnswers(steps, s.answers), []);
    assert.equal(s.current, 1);
  });

  it("clears only the skipped step, keeping the other answers", () => {
    let s = answerWithOption(initialStepperState(), steps, "o1").state;
    s = setDraft(s, "q2", "Running late");
    s = answerWithText(s, steps).state;
    s = goBack(s);
    s = skipStep(s, steps).state;
    const done = advanceConnect(s, steps);
    assert.deepEqual(done.completed, [
      {
        stepId: "q1",
        question: "Who is it for?",
        answer: "John",
        source: "option",
        optionId: "o1",
      },
    ]);
  });

  it("completes without the declined answer when the skip is terminal", () => {
    let s = answerWithOption(initialStepperState(), [Q1, Q2], "o1").state;
    s = setDraft(s, "q2", "hi");
    s = answerWithText(s, [Q1, Q2]).state;
    const done = skipStep(s, [Q1, Q2]);
    assert.deepEqual(done.completed, [
      {
        stepId: "q1",
        question: "Who is it for?",
        answer: "John",
        source: "option",
        optionId: "o1",
      },
    ]);
  });

  it("leaves the answer map untouched on a never-answered step", () => {
    const s = initialStepperState();
    assert.equal(skipStep(s, steps).state.answers, s.answers);
  });

  it("leaves the answer map untouched when the skipped step is a connect", () => {
    const flow = [Q1, CONNECT, SIGNIN];
    const s = answerWithOption(initialStepperState(), flow, "o1").state;
    assert.equal(skipStep(s, flow).state.answers, s.answers);
  });
});

describe("advances other than skip keep the committed answers", () => {
  it("keeps an already-selected option when send fires with no typed text", () => {
    let s = answerWithOption(initialStepperState(), [Q1, Q2], "o1").state;
    s = goBack(s);
    const t = answerWithText(s, [Q1, Q2]);
    assert.deepEqual(t.state.answers.q1, { answer: "John", optionId: "o1" });
    assert.equal(t.state.current, 1);
  });

  it("keeps prior answers across connect, signin, credential and custom", () => {
    const flow = [Q1, CONNECT, SIGNIN, CREDENTIAL, CUSTOM];
    let s = answerWithOption(initialStepperState(), flow, "o1").state;
    s = advanceConnect(s, flow).state;
    s = advanceSignin(s, flow).state;
    s = advanceCredential(s, flow).state;
    const done = advanceCustom(s, flow);
    assert.deepEqual(done.completed, [
      {
        stepId: "q1",
        question: "Who is it for?",
        answer: "John",
        source: "option",
        optionId: "o1",
      },
    ]);
  });
});

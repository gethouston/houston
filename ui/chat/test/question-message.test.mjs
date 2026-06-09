import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeQuestionAnswerMessage,
  decodeQuestionMessage,
} from "../src/question-message.ts";

const SAMPLE_SPEC = {
  id: "set-1",
  questions: [
    {
      id: "q1",
      prompt: "Pick one",
      options: [
        { id: "1", label: "First" },
        { id: "2", label: "Second" },
      ],
      allowMultiple: false,
      allowFreeText: true,
    },
  ],
};

test("question marker decodes spec and strips prose", () => {
  const body =
    "Before we plan, I need your input.\n\n" +
    `<!--houston:question ${JSON.stringify(SAMPLE_SPEC)}-->`;
  const decoded = decodeQuestionMessage(body);
  assert.ok(decoded);
  assert.equal(decoded.content, "Before we plan, I need your input.");
  assert.equal(decoded.spec.id, "set-1");
  assert.equal(decoded.spec.questions[0].options.length, 2);
});

test("plain assistant text returns null", () => {
  assert.equal(decodeQuestionMessage("Just a normal reply"), null);
});

test("malformed question JSON returns null", () => {
  assert.equal(decodeQuestionMessage("<!--houston:question {bad}-->"), null);
});

test("answer marker decodes payload and trailing text", () => {
  const answerSet = {
    id: "set-1",
    answers: [{ questionId: "q1", optionIds: ["1"], text: "" }],
  };
  const body =
    `<!--houston:question-answer ${JSON.stringify(answerSet)}-->\n\n` +
    "Pick one\nFirst";
  const decoded = decodeQuestionAnswerMessage(body);
  assert.ok(decoded);
  assert.equal(decoded.answerSet.id, "set-1");
  assert.equal(decoded.text, "Pick one\nFirst");
});

test("malformed answer JSON returns null", () => {
  assert.equal(
    decodeQuestionAnswerMessage("<!--houston:question-answer {bad}-->"),
    null,
  );
});

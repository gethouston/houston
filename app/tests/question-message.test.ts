import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { decodeQuestionAnswerMessage } from "../../ui/chat/src/question-message.ts";
import {
  encodeQuestionAnswerMessage,
  formatQuestionAnswersReadable,
} from "../src/lib/question-message-encode.ts";
import type {
  QuestionAnswerSet,
  QuestionSpec,
} from "../../ui/chat/src/question-message.ts";

const spec: QuestionSpec = {
  id: "set-abc",
  questions: [
    {
      id: "q1",
      prompt: "Which stack?",
      options: [
        { id: "google", label: "Google" },
        { id: "ms", label: "Microsoft" },
      ],
      allowFreeText: false,
    },
  ],
};

const answerSet: QuestionAnswerSet = {
  id: "set-abc",
  answers: [{ questionId: "q1", optionIds: ["google"], text: "" }],
};

describe("encodeQuestionAnswerMessage", () => {
  it("wraps JSON marker and readable text", () => {
    const encoded = encodeQuestionAnswerMessage(spec, answerSet);
    strictEqual(encoded.startsWith("<!--houston:question-answer "), true);
    const decoded = decodeQuestionAnswerMessage(encoded);
    deepStrictEqual(decoded?.answerSet, answerSet);
    strictEqual(decoded?.text, "Which stack?\nGoogle");
  });

  it("formats readable answers for the model", () => {
    strictEqual(
      formatQuestionAnswersReadable(spec, answerSet),
      "Which stack?\nGoogle",
    );
  });
});

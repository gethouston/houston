import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import {
  answerWithOption,
  answerWithText,
  initialStepperState,
  setDraft,
} from "../../ui/chat/src/interaction-card-logic.ts";
import { approvalsFromAnswers } from "../src/lib/interaction-approvals.ts";

const card = {
  kind: "question" as const,
  id: "x1",
  requestId: "req",
  question: "Delete Dobby?",
  options: [
    { kind: "approval" as const, id: "approve", label: "Yes, go ahead" },
    { kind: "approval" as const, id: "decline", label: "Cancel" },
  ],
};
test("typing an approval label never mints a receipt", () => {
  const { completed = [] } = answerWithText(
    setDraft(initialStepperState(), "x1", "Yes, go ahead"),
    [card],
  );
  deepStrictEqual(approvalsFromAnswers([card], completed), []);
});
test("an explicit selection retains its source and option id", () => {
  const { completed = [] } = answerWithOption(
    initialStepperState(),
    [card],
    "approve",
  );
  const chosen = completed[0];
  strictEqual(chosen?.source, "option");
  strictEqual(chosen?.source === "option" ? chosen.optionId : null, "approve");
  deepStrictEqual(approvalsFromAnswers([card], completed), [
    { requestId: "req", decision: "approve" },
  ]);
});
test("an ordinary option named approve cannot mint a receipt", () => {
  const ordinary = {
    ...card,
    options: [{ id: "approve", label: "Yes, go ahead" }],
  };
  const { completed = [] } = answerWithOption(
    initialStepperState(),
    [ordinary],
    "approve",
  );
  deepStrictEqual(approvalsFromAnswers([ordinary], completed), []);
});

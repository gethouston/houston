import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { test } from "node:test";
import type { InteractionStep } from "@houston/protocol";
import {
  answerWithOption,
  answerWithText,
  initialStepperState,
  setDraft,
  skipStep,
} from "../../ui/chat/src/interaction-card-logic.ts";
import { approvalsFromAnswers } from "../src/lib/interaction-approvals.ts";
import { hydrateParkedState } from "../src/lib/interaction-draft-hydrate.ts";
import { interactionDraftKey } from "../src/stores/interaction-drafts.ts";

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

/** The two interactions of the replay scenario: same step ids and same wording,
 *  a DIFFERENT host request and a different operation underneath it. */
const approvalCard = (requestId: string, detail: string) => ({
  kind: "question" as const,
  id: "a1",
  requestId,
  question: "Run this?",
  detail,
  options: [
    { kind: "approval" as const, id: "approve", label: "Yes, go ahead" },
    { kind: "approval" as const, id: "decline", label: "Cancel" },
  ],
});
const folderQuestion = {
  kind: "question" as const,
  id: "q2",
  question: "Which folder?",
};
const first = [
  approvalCard("r1", "rm -rf ~/photos"),
  folderQuestion,
] satisfies InteractionStep[];
const second = [
  approvalCard("r2", "rm -rf ~/documents"),
  folderQuestion,
] satisfies InteractionStep[];

test("a parked approval belongs to the request it was clicked for", () => {
  ok(interactionDraftKey(first) !== interactionDraftKey(second));
});

test("a restored card cannot approve what the user never saw", () => {
  const parked = answerWithOption(
    initialStepperState(),
    first,
    "approve",
  ).state;
  const restored = hydrateParkedState(parked, second);
  const { completed = [] } = answerWithText(
    setDraft(skipStep(restored, second).state, "q2", "Invoices"),
    second,
  );

  deepStrictEqual(approvalsFromAnswers(second, completed), []);
});

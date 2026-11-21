import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapInteractionSteps } from "../src/components/chat-interaction-steps.ts";
import type { ApprovalCardCopy } from "../src/lib/interaction-approval-labels.ts";

const approvalCopy = {} as ApprovalCardCopy;

function map(steps: Parameters<typeof mapInteractionSteps>[0]["steps"]) {
  return mapInteractionSteps({
    steps,
    approvalCopy,
    resolveBrand: (toolkit) => ({ name: toolkit }),
    resolveProviderName: (id) => id,
    resolveAgentName: () => undefined,
    t: ((key: string) => key) as Parameters<typeof mapInteractionSteps>[0]["t"],
  });
}

describe("mapInteractionSteps wantsFiles", () => {
  it("hands a question's wantsFiles flag to the card", () => {
    const [step] = map([
      {
        kind: "question",
        id: "q1",
        question: "Send the logo",
        wantsFiles: true,
      },
    ]);
    assert.equal(step.kind === "question" && step.wantsFiles, true);
  });

  it("leaves a question persisted without the flag a plain question", () => {
    const [step] = map([{ kind: "question", id: "q1", question: "Which?" }]);
    assert.equal(step.kind === "question" && "wantsFiles" in step, false);
  });
});

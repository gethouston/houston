import { deepStrictEqual, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localizeApprovalQuestion } from "../src/lib/interaction-approval-labels.ts";

for (const locale of ["en", "es", "pt"]) {
  test(`${locale} renders structural approval controls in its locale`, () => {
    const labels = JSON.parse(
      readFileSync(
        new URL(`../src/locales/${locale}/chat.json`, import.meta.url),
        "utf8",
      ),
    ).approvalCard;
    const step = localizeApprovalQuestion(
      {
        kind: "question",
        id: "x",
        requestId: "host",
        question: "Delete Dobby.",
        detail: "All work.",
        options: [
          { kind: "approval", id: "approve" },
          { kind: "approval", id: "decline" },
        ],
      },
      labels,
    );
    deepStrictEqual(
      step.options?.map((o) => o.label),
      [labels.approve, labels.decline],
    );
    strictEqual(step.question, `Delete Dobby. ${labels.closing}`);
    strictEqual(step.detail, "All work.");
  });
}

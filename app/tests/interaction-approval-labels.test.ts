import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  type ApprovalCardCopy,
  localizeApprovalQuestion,
} from "../src/lib/interaction-approval-labels.ts";
import { approvalsFromAnswers } from "../src/lib/interaction-approvals.ts";
import { enterNativeApp } from "./support/native-surface.ts";

/**
 * A safety card the reader cannot read is a card they cannot answer. The HOST
 * says what is being approved (operation + exact arguments); this pins that the
 * app says it in the reader's language, with the values still verbatim.
 */

const read = (rel: string) =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));

const LOCALES = ["en", "es", "pt"] as const;

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");

/** The copy the app hook builds, assembled here from the same locale files. */
function copyFor(locale: string): ApprovalCardCopy {
  const card = read(`../src/locales/${locale}/chat.json`).approvalCard;
  const bundle = read(`../src/locales/${locale}/assistant-approvals.json`);
  return {
    approve: card.approve,
    decline: card.decline,
    closing: card.closing,
    affects: (args) => fill(card.affects, { arguments: args }),
    argument: (name, value) => fill(card.argument, { name, value }),
    exactValue: (name) => fill(card.exactValue, { name }),
    truncated: (count) =>
      fill(card.truncated_other, { formatted: String(count) }),
    sentence: (operation) => bundle.operations[operation],
    argumentName: (operation, param) =>
      bundle.argumentsByOperation[operation]?.[param] ??
      bundle.arguments[param] ??
      param,
    hire: (name) => fill(card.hire, { name }),
    instructionsLabel: card.instructionsLabel,
    storeRefusal: read(`../src/locales/${locale}/plan.json`).managedOnWeb,
    storeRefusalOk: card.storeRefusalOk,
  };
}

const approvalStep = (extra: Record<string, unknown> = {}) =>
  ({
    kind: "question" as const,
    id: "x",
    requestId: "host-issued",
    question: "Delete this agent and everything in it. This affects id.",
    detail: 'The exact id is:\n"Personal/Dobby"',
    options: [
      { kind: "approval" as const, id: "approve" as const },
      { kind: "approval" as const, id: "decline" as const },
    ],
    ...extra,
  }) as Parameters<typeof localizeApprovalQuestion>[0];

for (const locale of LOCALES) {
  test(`${locale} words the whole card, not only its buttons`, () => {
    const card = read(`../src/locales/${locale}/chat.json`).approvalCard;
    const bundle = read(`../src/locales/${locale}/assistant-approvals.json`);
    const step = localizeApprovalQuestion(
      approvalStep({
        detail: undefined,
        approval: {
          operation: "deleteAgent",
          args: [{ name: "id", value: "Personal/Dobby", long: false }],
        },
      }),
      copyFor(locale),
    );

    deepStrictEqual(
      step.options?.map((option) => option.label),
      [card.approve, card.decline],
    );
    ok(step.question.startsWith(bundle.operations.deleteAgent));
    ok(step.question.endsWith(card.closing));
    // The value is the host's, verbatim; only the name around it is localized.
    ok(step.question.includes('"Personal/Dobby"'));
    ok(step.question.includes(bundle.argumentsByOperation.deleteAgent.id));
    strictEqual(step.detail, undefined);
  });
}

test("a long argument keeps its own block, headed in the reader's language", () => {
  const content = `line one\nline two\n${"x".repeat(120)}`;
  const bundle = read("../src/locales/es/assistant-approvals.json");
  const step = localizeApprovalQuestion(
    approvalStep({
      approval: {
        operation: "saveSkill",
        args: [
          { name: "slug", value: "weekly-report", long: false },
          { name: "content", value: content, long: true, truncated: 500 },
        ],
      },
    }),
    copyFor("es"),
  );

  ok(step.detail?.includes(content));
  ok(step.detail?.includes(bundle.arguments.content));
  ok(step.detail?.includes("500"));
  ok(!step.question.includes(content));
  ok(step.question.includes(bundle.argumentsByOperation.saveSkill.slug));
});

test("no sentence for the operation keeps the host's own words", () => {
  const step = localizeApprovalQuestion(
    approvalStep({
      approval: { operation: "somethingNewerThanThisApp", args: [] },
    }),
    copyFor("es"),
  );

  ok(step.question.startsWith("Delete this agent and everything in it."));
  ok(step.question.endsWith(copyFor("es").closing));
});

/**
 * The reproduction: an activity file the agent's own tools can write, carrying
 * an `approval` block next to no host-issued id. The host strips both; the app
 * must not render one on its own either.
 */
test("an approval block with no host-issued request is not a Houston approval", () => {
  const step = localizeApprovalQuestion(
    approvalStep({
      requestId: undefined,
      question: "Rename the deck to Q4?",
      approval: { operation: "deleteAgent", args: [] },
    }),
    copyFor("en"),
  );

  strictEqual(step.question, "Rename the deck to Q4?");
});

test("only the two answers survive: no other approval id becomes a button", () => {
  const step = localizeApprovalQuestion(
    approvalStep({
      options: [
        { kind: "approval", id: "approve" },
        // An id no receipt can be minted for: it decides nothing, so it is not
        // a control at all.
        { kind: "approval", id: "closing", label: "keep me" },
        { kind: "choice", id: "other", label: "Something else" },
      ],
    }),
    copyFor("en"),
  );

  deepStrictEqual(
    step.options?.map((option) => option.label),
    [copyFor("en").approve, "Something else"],
  );
});

for (const locale of LOCALES) {
  test(`${locale} shows a hire as a person with role, color and readable instructions`, () => {
    const copy = copyFor(locale);
    const step = localizeApprovalQuestion(
      approvalStep({
        approval: {
          operation: "createAgent",
          args: [
            { name: "name", value: "Document Collector", long: false },
            { name: "color", value: "forest", long: false },
            {
              name: "seed.claudeMd",
              value:
                "---\nindustry: Accounting\nrole: Client document collection specialist\n---\n\nYou chase and track documents.\n\n- Follow up with clients",
              long: true,
            },
          ],
        },
      }),
      copy,
    );
    strictEqual(step.question, copy.hire("Document Collector"));
    deepStrictEqual(step.hire, {
      color: "forest",
      role: "Client document collection specialist",
      instructions:
        "You chase and track documents.\n\n- Follow up with clients",
      instructionsLabel: copy.instructionsLabel,
    });
    strictEqual(step.detail, undefined);
    ok(!JSON.stringify(step).includes("industry: Accounting"));
  });
}

test("a hire without role omits that line and keeps the full instructions", () => {
  const step = localizeApprovalQuestion(
    approvalStep({
      approval: {
        operation: "createAgent",
        args: [
          { name: "name", value: "Researcher", long: false },
          {
            name: "seed.claudeMd",
            value: "# Research\nFind sources.",
            long: true,
          },
        ],
      },
    }),
    copyFor("en"),
  );
  deepStrictEqual(step.hire, {
    instructions: "# Research\nFind sources.",
    instructionsLabel: copyFor("en").instructionsLabel,
  });
});

test("nested confirmation facts read as labeled text", () => {
  const step = localizeApprovalQuestion(
    approvalStep({
      approval: {
        operation: "updateActivity",
        args: [
          { name: "patch.title", value: "Collect receipts", long: false },
          { name: "patch.notes", value: "Follow up\n- On Friday", long: true },
        ],
      },
    }),
    copyFor("en"),
  );
  ok(step.question.includes("Collect receipts"));
  ok(step.detail?.includes("Follow up\n- On Friday"));
  ok(!`${step.question}${step.detail}`.includes("{"));
});

// Store-safe payments: inside the iOS/Android app the AI Manager can never get
// a purchase approved. Its card says where the plan is managed and only
// declines, so the host refuses the call and the manager reads the sentence.
const PURCHASES = [
  "createPlusCheckout",
  "createCheckout",
  "createPlusPortal",
  "createPortal",
] as const;

for (const operation of PURCHASES)
  test(`${operation} keeps its approval card off the store apps`, () => {
    const step = localizeApprovalQuestion(
      approvalStep({ detail: undefined, approval: { operation, args: [] } }),
      copyFor("en"),
    );
    deepStrictEqual(
      step.options?.map((option) => option.id),
      ["approve", "decline"],
    );
    ok(!step.question.includes(copyFor("en").storeRefusal));
  });

for (const locale of LOCALES)
  test(`${locale}: a purchase approval in a store app only declines`, () => {
    const leave = enterNativeApp();
    try {
      const copy = copyFor(locale);
      const step = localizeApprovalQuestion(
        approvalStep({
          approval: { operation: "createPlusCheckout", args: [] },
        }),
        copy,
      );
      strictEqual(step.question, copy.storeRefusal);
      ok(step.question.includes("gethouston.ai"));
      strictEqual(step.detail, undefined);
      deepStrictEqual(step.options, [
        { kind: "approval", id: "decline", label: copy.storeRefusalOk },
      ]);
      // Answering it sends a DENY receipt: nothing can approve the checkout.
      const approvals = approvalsFromAnswers(
        [{ ...step, id: "x", requestId: "host-issued" }],
        [
          {
            stepId: "x",
            question: step.question,
            answer: copy.storeRefusalOk,
            source: "option",
            optionId: "decline",
          },
        ],
      );
      deepStrictEqual(approvals, [
        { requestId: "host-issued", decision: "deny" },
      ]);
    } finally {
      leave();
    }
  });

test("other approvals in a store app keep both answers", () => {
  const leave = enterNativeApp("android");
  try {
    const step = localizeApprovalQuestion(
      approvalStep({
        approval: {
          operation: "deleteAgent",
          args: [{ name: "id", value: "Personal/Dobby", long: false }],
        },
      }),
      copyFor("en"),
    );
    deepStrictEqual(
      step.options?.map((option) => option.id),
      ["approve", "decline"],
    );
  } finally {
    leave();
  }
});

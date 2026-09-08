import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  type ApprovalCardCopy,
  localizeApprovalQuestion,
} from "../src/lib/interaction-approval-labels.ts";

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

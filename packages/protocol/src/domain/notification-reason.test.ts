import { expect, test } from "vitest";
import { notificationReason } from "./notification-reason";

test("error and clean finish have explicit reasons", () => {
  expect(notificationReason("error", null)).toEqual({
    reason: "error",
    question_count: 0,
  });
  expect(notificationReason("needs_you", null)).toEqual({
    reason: "finished",
    question_count: 0,
  });
});

test("question count and first unmet kind mirror interaction copy", () => {
  const steps = [
    { kind: "signin" as const, id: "signin" },
    { kind: "question" as const, id: "q1", question: "One?" },
    { kind: "question" as const, id: "q2", question: "Two?" },
  ];
  expect(notificationReason("needs_you", { steps })).toEqual({
    reason: "question",
    question_count: 2,
  });
  for (const [kind, reason] of [
    ["signin", "signin"],
    ["connect", "connect"],
    ["provider_connect", "connect"],
    ["credential", "credential"],
    ["hands_on", "hands_on"],
  ] as const) {
    const step =
      kind === "connect" || kind === "credential"
        ? { kind, id: "x", toolkit: "tool" }
        : kind === "provider_connect"
          ? { kind, id: "x", provider: "provider" }
          : kind === "hands_on"
            ? { kind, id: "x", surface: "files" as const }
            : { kind, id: "x" };
    expect(notificationReason("needs_you", { steps: [step] })).toEqual({
      reason,
      question_count: 0,
    });
  }
});

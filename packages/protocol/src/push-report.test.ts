import { expect, test } from "vitest";
import { pushReportSchema } from "./push-report";

const common = {
  v: 1,
  conversation_id: "c",
  mission: { id: "m", title: "Mission" },
};

test("accepts each pinned report variant", () => {
  expect(
    pushReportSchema.safeParse({
      ...common,
      kind: "turn_settled",
      turn_id: "t",
      reason: "finished",
      question_count: 0,
      audience: { everyone: true },
    }).success,
  ).toBe(true);
  expect(
    pushReportSchema.safeParse({
      ...common,
      kind: "mentioned",
      event_key: "n",
      user_ids: ["u"],
    }).success,
  ).toBe(true);
});

test("rejects unknown fields, negative questions and oversized recipient lists", () => {
  const settled = {
    ...common,
    kind: "turn_settled",
    turn_id: "t",
    reason: "question",
    question_count: 1,
    audience: { user_ids: ["u"] },
  };
  expect(pushReportSchema.safeParse({ ...settled, extra: true }).success).toBe(
    false,
  );
  expect(
    pushReportSchema.safeParse({ ...settled, question_count: -1 }).success,
  ).toBe(false);
  expect(
    pushReportSchema.safeParse({
      ...settled,
      audience: { user_ids: Array(512).fill("u") },
    }).success,
  ).toBe(true);
  expect(
    pushReportSchema.safeParse({
      ...settled,
      audience: { user_ids: Array(513).fill("u") },
    }).success,
  ).toBe(false);
  expect(
    pushReportSchema.safeParse({
      ...common,
      kind: "mentioned",
      event_key: "n",
      user_ids: Array(33).fill("u"),
    }).success,
  ).toBe(false);
});

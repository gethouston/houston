import { expect, test } from "vitest";
import { turnPinOf } from "./turn-body";

const body = (v: unknown) => Buffer.from(JSON.stringify(v));

test("a send's provider/model/effort become the turn's pin", () => {
  expect(
    turnPinOf(
      body({
        text: "hi",
        provider: "anthropic",
        model: "claude-sonnet-5",
        effort: "medium",
      }),
    ),
  ).toEqual({
    provider: "anthropic",
    model: "claude-sonnet-5",
    effort: "medium",
  });
});

test("no provider means no pin, whatever else the body carries", () => {
  expect(
    turnPinOf(body({ text: "hi", model: "claude-sonnet-5" })),
  ).toBeUndefined();
  expect(turnPinOf(body({ text: "hi", provider: "" }))).toBeUndefined();
  expect(turnPinOf(Buffer.from(""))).toBeUndefined();
  expect(turnPinOf(Buffer.from("{not json"))).toBeUndefined();
});

test("empty model and effort are absent, not empty strings", () => {
  expect(
    turnPinOf(body({ provider: "anthropic", model: "", effort: null })),
  ).toEqual({ provider: "anthropic" });
});

import { expect, test } from "vitest";
import type { ThinkingLevel } from "../types";
import { toSdkEffort } from "./effort";

test("minimal disables thinking at the lowest effort", () => {
  expect(toSdkEffort("minimal")).toEqual({
    thinking: { type: "disabled" },
    effort: "low",
  });
});

test("low / medium / high enable thinking with the matching effort", () => {
  expect(toSdkEffort("low")).toEqual({
    thinking: { type: "enabled" },
    effort: "low",
  });
  expect(toSdkEffort("medium")).toEqual({
    thinking: { type: "enabled" },
    effort: "medium",
  });
  expect(toSdkEffort("high")).toEqual({
    thinking: { type: "enabled" },
    effort: "high",
  });
});

test("xhigh (pi's ceiling) maps to the SDK's maximum effort", () => {
  expect(toSdkEffort("xhigh")).toEqual({
    thinking: { type: "enabled" },
    effort: "max",
  });
});

test("every pi ThinkingLevel is mapped (exhaustive)", () => {
  const levels: ThinkingLevel[] = ["minimal", "low", "medium", "high", "xhigh"];
  for (const l of levels) expect(toSdkEffort(l)).toBeDefined();
});

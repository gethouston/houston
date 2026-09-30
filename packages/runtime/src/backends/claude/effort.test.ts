import { expect, test } from "vitest";
import type { ThinkingLevel } from "../types";
import { toSdkEffort } from "./effort";

// Every model the anthropic provider offers (Sonnet 5.5, Opus 5.5, Fable 5.1)
// is always-thinking — pi lists neither `off` nor `minimal` for them — so a
// stored `minimal` must never ask the SDK to disable thinking.
test("minimal keeps thinking on at the lowest effort", () => {
  expect(toSdkEffort("minimal")).toEqual({
    thinking: { type: "enabled" },
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

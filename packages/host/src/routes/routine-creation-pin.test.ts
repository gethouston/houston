import { expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { createRoutineChecked } from "./routine-write";

const daily = { name: "Daily", prompt: "Summarize", schedule: "0 9 * * *" };
const opts = { triggersEnabled: false, nowIso: "2026-01-01T00:00:00Z" };

test("an unknown effort uses medium before choosing the closest served level", async () => {
  const result = await createRoutineChecked(
    new MemoryVfs(),
    "ws/agent",
    "ws",
    { ...daily, provider: "anthropic", effort: "unrecognized" },
    opts,
  );
  expect(result).toMatchObject({ routine: { effort: "medium" } });
});

test.each([
  ["openai", "openai-codex", "gpt-6.1-terra"],
  ["claude", "anthropic", "claude-sonnet-5-5"],
])("creation canonicalizes explicit %s before choosing its default", async (alias, provider, model) => {
  const result = await createRoutineChecked(
    new MemoryVfs(),
    "ws/agent",
    "ws",
    { ...daily, provider: alias },
    opts,
  );
  expect(result).toMatchObject({ routine: { provider, model } });
});

test.each([
  ["off", "low"],
  ["unrecognized", "low"],
  [undefined, "low"],
  ["max", "max"],
])("Terra creation maps %s to served effort %s", async (effort, expected) => {
  const result = await createRoutineChecked(
    new MemoryVfs(),
    "ws/agent",
    "ws",
    { ...daily, provider: "openai-codex", effort },
    opts,
  );
  expect(result).toMatchObject({
    routine: { model: "gpt-6.1-terra", effort: expected },
  });
});

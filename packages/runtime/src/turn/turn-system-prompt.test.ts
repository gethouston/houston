import { houstonSystemPrompt } from "@houston/host/src/houston-prompt";
import { expect, test } from "vitest";
import { turnSystemPrompt } from "./turn-system-prompt";

/**
 * A standing pod's runtime is handed the Houston product prompt by the host
 * that spawns it (HOUSTON_SYSTEM_PROMPT). A pool worker has no host in front
 * of it, so before this every pooled turn ran on the engine's bare fallback
 * and never saw the product copy at all.
 */

test("a pooled turn runs on the product prompt a managed pod's host stamps", () => {
  const prompt = turnSystemPrompt("local", { HOUSTON_MANAGED_CLOUD: "1" });
  expect(prompt.startsWith(houstonSystemPrompt({ triggers: true }))).toBe(true);
});

test("event wakes are offered only where a trigger backend exists", () => {
  const offline = turnSystemPrompt("local", {});
  expect(offline.startsWith(houstonSystemPrompt({ triggers: false }))).toBe(
    true,
  );
  expect(offline.startsWith(houstonSystemPrompt({ triggers: true }))).toBe(
    false,
  );
});

test("the code-execution sentence still follows this turn's own capability", () => {
  expect(turnSystemPrompt("disabled", {})).toContain(
    "You cannot run shell commands",
  );
  expect(turnSystemPrompt("local", {})).toContain("run commands");
  expect(turnSystemPrompt("local", {})).not.toContain(
    "You cannot run shell commands",
  );
});

test("an unknown routine zone keeps main's prompt byte-identical", async () => {
  await expect(turnSystemPrompt("local", {})).toMatchFileSnapshot(
    "./__snapshots__/turn-system-prompt-main.txt",
  );
});

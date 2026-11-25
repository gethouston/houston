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
  const prompt = turnSystemPrompt("local", "full", {
    HOUSTON_MANAGED_CLOUD: "1",
  });
  expect(prompt.startsWith(houstonSystemPrompt({ triggers: true }))).toBe(true);
});

test("event wakes are offered only where a trigger backend exists", () => {
  const offline = turnSystemPrompt("local", "full", {});
  expect(offline.startsWith(houstonSystemPrompt({ triggers: false }))).toBe(
    true,
  );
  expect(offline.startsWith(houstonSystemPrompt({ triggers: true }))).toBe(
    false,
  );
});

test("the code-execution sentence still follows this turn's own capability", () => {
  expect(turnSystemPrompt("disabled", "full", {})).toContain(
    "You cannot run shell commands",
  );
  expect(turnSystemPrompt("local", "full", {})).toContain("run commands");
  expect(turnSystemPrompt("local", "full", {})).not.toContain(
    "You cannot run shell commands",
  );
});

test("an unknown routine zone keeps main's prompt byte-identical", async () => {
  await expect(turnSystemPrompt("local", "full", {})).toMatchFileSnapshot(
    "./__snapshots__/turn-system-prompt-main.txt",
  );
});

test("the missions section follows what the turn mounts", () => {
  const full = turnSystemPrompt("local", "full", {});
  expect(full).toContain("`start_mission`");
  expect(full).toContain("## Working with other AI Employees");
  expect(full).not.toContain("cannot start missions of its own");

  const nested = turnSystemPrompt("local", "nested", {});
  expect(nested).toContain("`start_mission`");
  expect(nested).toContain("cannot start missions of its own");

  const none = turnSystemPrompt("local", "none", {});
  expect(none).not.toContain("start_mission");
  expect(none).not.toContain("list_agents");
  expect(none).toContain("Missions can't be started, checked or moved");
});

import { join } from "node:path";
import { expect, test } from "vitest";
import { turnClaudeLayout } from "./turn-backend";

test("keeps durable Claude state in the claimed conversation session", () => {
  const layout = turnClaudeLayout("/turn", "/turn/store/data", "c1");

  expect(layout.configDir).toBe(
    join("/turn/store/data", "sessions", "c1", "claude"),
  );
  expect(layout.sessionsFile).toBe(join(layout.configDir, "sessions.json"));
});

test("keeps credential recovery and HOME outside the synced store", () => {
  const layout = turnClaudeLayout("/turn", "/turn/store/data", "c1");

  expect(layout.credentialStorageDir).toBe(join("/turn", "claude-credstore"));
  expect(layout.homeDir).toBe(join("/turn", "home"));
  expect(layout.credentialStorageDir).not.toContain(join("/turn", "store"));
  expect(layout.homeDir).not.toContain(join("/turn", "store"));
});

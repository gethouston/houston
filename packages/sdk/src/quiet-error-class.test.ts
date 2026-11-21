import { expect, test } from "vitest";
import { quietBurstKey } from "./quiet-error-class";

test("every offline command collapses into one key", () => {
  expect(quietBurstKey("offline", "integration_toolkits", null)).toBe(
    quietBurstKey("offline", "list_agents", "agent-a"),
  );
});

test("waking answers stay distinct per command and agent", () => {
  const a = quietBurstKey("engine_waking", "read_agent_file", "agent-a");
  expect(a).toBe("engine_waking:read_agent_file:agent-a");
  expect(quietBurstKey("engine_waking", "read_agent_file", "agent-b")).not.toBe(
    a,
  );
  expect(
    quietBurstKey("engine_waking", "load_chat_history", "agent-a"),
  ).not.toBe(a);
  expect(quietBurstKey("engine_waking", "read_agent_file", null)).toBe(
    "engine_waking:read_agent_file:",
  );
});

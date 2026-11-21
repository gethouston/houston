import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSISTANT_AGENT_COLOR,
  assistantAgent,
} from "../src/components/assistant/assistant-agent.ts";

describe("assistantAgent", () => {
  const handle = { agent: "default/.assistant", conversation: "assistant" };

  it("routes every per-agent call at the discovered address", () => {
    const agent = assistantAgent(handle, "Assistant");
    assert.equal(agent.id, "default/.assistant");
    assert.equal(agent.folderPath, "default/.assistant");
  });

  it("wears the localized name and a palette id, never a hex", () => {
    const agent = assistantAgent(handle, "Asistente");
    assert.equal(agent.name, "Asistente");
    assert.equal(agent.color, ASSISTANT_AGENT_COLOR);
    assert.doesNotMatch(String(agent.color), /^#/);
  });

  it("treats an opaque handle as opaque", () => {
    const agent = assistantAgent(
      { agent: "pod-7f3a", conversation: "c-1" },
      "Assistant",
    );
    assert.equal(agent.id, "pod-7f3a");
    assert.equal(agent.folderPath, "pod-7f3a");
  });
});

import assert from "node:assert/strict";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  SessionManager,
  VIRTUAL_MODEL_STATE_ENTRY,
} from "@earendil-works/pi-coding-agent";
import { SESSION_LOG_ROTATION_BYTES } from "./session-rotation";

export function sessionFile(manager: SessionManager): string {
  const file = manager.getSessionFile();
  assert(file);
  return file;
}

export function assistant(model = "physical-model"): AssistantMessage {
  return {
    role: "assistant",
    api: "anthropic-messages",
    provider: "anthropic",
    model,
    content: [{ type: "text", text: "earlier answer" }],
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  };
}

export function seedRotatableSession(cwd: string, dir: string) {
  const manager = SessionManager.create(cwd, dir, { id: "test-session" });
  manager.appendModelChange("anthropic", "old-model");
  manager.appendThinkingLevelChange("low");
  manager.appendMessage({
    role: "system",
    content: "system prompt",
    timestamp: 0,
  });
  const old = manager.appendMessage({
    role: "user",
    content: "é".repeat(SESSION_LOG_ROTATION_BYTES / 2 + 1024),
    timestamp: 0,
  });
  manager.appendMessage(assistant("old-model"));
  manager.appendCompaction("first summary", old, 100_000);
  manager.appendThinkingLevelChange("high");
  manager.appendModelChange("anthropic", "selected-model");
  const response = manager.appendMessage({
    ...assistant(),
    content: [
      {
        type: "toolCall",
        id: "call-1",
        name: "read",
        arguments: { path: "notes.txt" },
      },
    ],
  });
  manager.appendSessionInfo("A long chat");
  manager.appendLabelChange(response, "checkpoint");
  manager.appendCustomEntry("extension-state", { enabled: true });
  manager.appendCustomEntry(VIRTUAL_MODEL_STATE_ENTRY, {
    provider: "anthropic",
    modelId: "selected-model",
    state: { count: 2 },
  });
  const kept = manager.appendMessage({
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read",
    content: [{ type: "text", text: "notes" }],
    isError: false,
    timestamp: 0,
  });
  manager.appendCompaction("second summary", kept, 120_000);
  manager.appendCustomMessageEntry("live-hint", "remember this", false);
  manager.appendCompaction("latest summary", kept, 130_000);
  manager.appendContextEdit(kept, { content: "edited notes" });
  manager.appendMessage({ role: "user", content: "continue", timestamp: 1 });
  return { manager, kept, response };
}

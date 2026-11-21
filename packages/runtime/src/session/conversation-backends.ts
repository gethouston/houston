import { authStorage, modelRuntime } from "../auth/storage";
import { createClaudeBackend } from "../backends/claude/backend";
import { serverClaudeLayout } from "../backends/claude/paths";
import { readAnthropicToken } from "../backends/claude/read-token";
import { createPiBackend } from "../backends/pi/backend";
import {
  backendFor,
  registerBackend,
  setDefaultBackend,
} from "../backends/registry";
import type { HarnessBackend } from "../backends/types";
import { config } from "../config";
import { assistantOptions } from "./assistant-family";
import { hostIntegrations } from "./host-tools";
import { SYSTEM_PROMPT } from "./resource-loader";
import { personalAssistant } from "./runtime-role";
import {
  browserToolOptions,
  fileToolGuard,
  piCustomTools,
  toolSelection,
} from "./session-tools";

export function serverBackendFor(providerId: string): HarnessBackend {
  return backendFor(providerId);
}

function registerServerBackends(): void {
  setDefaultBackend(
    createPiBackend({
      workspaceDir: config.workspaceDir,
      dataDir: config.dataDir,
      modelRuntime,
      tools: toolSelection.toolNames,
      customTools: piCustomTools,
    }),
  );
  registerAnthropicBackend();
}

function registerAnthropicBackend(): void {
  registerBackend(
    "anthropic",
    createClaudeBackend({
      workspaceDir: config.workspaceDir,
      layout: serverClaudeLayout(config.dataDir),
      readToken: () => readAnthropicToken(authStorage),
      toolSelection,
      systemPrompt: config.systemPrompt || SYSTEM_PROMPT,
      fileGuard: fileToolGuard,
      integrations: hostIntegrations,
      assistant: assistantOptions,
      personalAssistant,
      browser: browserToolOptions,
    }),
  );
}

registerServerBackends();

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
import { fileToolGuard, piCustomTools, toolSelection } from "./session-tools";

/**
 * The long-lived server's backend registrations, wired from this runtime's tool
 * surface (session-tools.ts) when this module loads.
 *
 * Everything that opens or rebuilds a session resolves through
 * `serverBackendFor` rather than the registry's own `backendFor`, so the
 * registrations travel with the dependency: a module cannot reach a backend
 * without having loaded the module that registers them. A bare
 * `import "./conversation-backends"` for the side effect alone would leave that
 * to an invisible import ORDER instead — and the module that forgot it (or lost
 * it to an import-graph change) would throw "no harness backend" at turn time,
 * with nothing at the call site to hint at why.
 */

/**
 * The backend a provider's turns run on: the pi default, or the Claude Agent SDK
 * for `anthropic`. A thin door over the registry ON PURPOSE — calling it is what
 * guarantees the caller loaded the registrations above.
 */
export function serverBackendFor(providerId: string): HarnessBackend {
  return backendFor(providerId);
}

function registerServerBackends(): void {
  // The default backend for this process: pi, wired to the module-level
  // workspace, credentials, and tool selection. Registered as the fallback so
  // every provider resolves to it until a provider ships its own harness.
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

/**
 * COMPLIANCE GATE: the `anthropic` provider runs its turns through the Claude
 * Agent SDK backend — `createClaudeBackend` → the real `claude` subprocess with
 * the token in `options.env` — NOT pi's in-process Anthropic client. pi-ai
 * hitting api.anthropic.com with a setup token + hand-set Claude Code beta
 * headers is exactly the harness-spoofing Anthropic server-blocks, so this
 * registration reroutes anthropic OFF the pi default above. Every other provider
 * still resolves to the pi backend. It reuses the SAME `toolSelection` the pi
 * path computed (so Bash gating / run-code stay identical) and Houston's product
 * system prompt (full-replace, never the SDK's claude_code preset).
 *
 * Server-mode only: the per-request cloud runtime (turn/) builds its own pi
 * backend per turn and never imports this module, so cloud anthropic stays OFF.
 */
function registerAnthropicBackend(): void {
  registerBackend(
    "anthropic",
    createClaudeBackend({
      workspaceDir: config.workspaceDir,
      layout: serverClaudeLayout(config.dataDir),
      readToken: () => readAnthropicToken(authStorage),
      toolSelection,
      systemPrompt: config.systemPrompt || SYSTEM_PROMPT,
      // SAME file policy object as the pi path: an ordinary agent keeps its
      // workspace plus the shared skills mirror, while the coordinator is held to
      // its memory document alone — so a skill every agent runs is not editable
      // from the one chat that never does work itself.
      fileGuard: fileToolGuard,
      // SAME integrations gate as the pi path above: present only when this
      // runtime can reach its host with a sandbox token, so the Claude backend's
      // in-process MCP server exposes the identical integration tool set.
      integrations: hostIntegrations,
      // SAME assistant gate as the pi path above, so an anthropic-backed agent on
      // the assistant pod can perform the identical set of Houston operations.
      assistant: assistantOptions,
      // SAME coordinator clamp as the pi path: the assistant's surface must not
      // depend on which provider the user happens to be on.
      personalAssistant,
    }),
  );
}

registerServerBackends();

import { resolveModel } from "../ai/providers";
import { authStorage, modelRegistry } from "../auth/storage";
import { createPiBackend } from "../backends/pi/backend";
import { backendFor, setDefaultBackend } from "../backends/registry";
import type { HarnessSession } from "../backends/types";
import { config } from "../config";
import { buildToolSelection } from "./tool-selection";
import { makeClampedFileTools } from "./tools/clamped-fs";
import { makeIdTokenProvider } from "./tools/gcp-id-token";
import { makeIntegrationTools } from "./tools/integrations";
import { makeRunCodeTool } from "./tools/run-code";

/**
 * The long-lived server's per-conversation session cache: the tool wiring shared
 * by every session, the Conversation record (session + turn queue + the tracked
 * provider/model + the executing turn's id), and the lazy build/rehydrate. Turn
 * execution runs the session behind the HarnessBackend seam (backends/) — pi is
 * the default backend, built once here from the module-level deps. Turn logic
 * lives in exec-turn.ts; the public turn API (run/cancel/dispose) in chat.ts.
 */

// Workspace-clamped file tools (security Gate #1). These shadow pi's builtins
// by name: pi's defaults resolve absolute paths as-is, so without the clamp a
// prompt-injected agent could read /etc/passwd or its own auth.json with no
// bash tool. See tools/clamped-fs.ts.
const fileTools = makeClampedFileTools(config.workspaceDir);

// Integration tools (Composio, platform mode): available whenever this runtime
// can reach its host with a sandbox token (server mode — local desktop +
// standing pods). They hold no credential; they proxy to /sandbox/integrations
// and the host (or its cloud gateway) acts as the user's Composio user_id.
const integrationTools =
  config.controlPlaneUrl && config.sandboxToken
    ? makeIntegrationTools({
        baseUrl: config.controlPlaneUrl,
        sandboxToken: config.sandboxToken,
      })
    : [];

const toolSelection = buildToolSelection({
  codeExecution: config.codeExecution,
  integrations: integrationTools.length > 0,
});
const runCodeTool = toolSelection.includeRunCode
  ? makeRunCodeTool({
      baseUrl: config.codeSandboxUrl,
      token: config.codeSandboxToken,
      workspaceDir: config.workspaceDir,
      limits: {
        maxConcurrent: config.runCodeMaxConcurrent,
        maxPerMinute: config.runCodePerMinute,
      },
      idToken: makeIdTokenProvider(config.codeSandboxUrl),
    })
  : null;

/**
 * The default backend for this process: pi, wired to the module-level workspace,
 * credentials, and tool selection. Registered as the fallback so every provider
 * resolves to it until a provider ships its own harness.
 */
const piBackend = createPiBackend({
  workspaceDir: config.workspaceDir,
  dataDir: config.dataDir,
  authStorage,
  modelRegistry,
  tools: toolSelection.toolNames,
  customTools: [
    ...fileTools,
    ...(runCodeTool ? [runCodeTool] : []),
    ...integrationTools,
  ],
});
setDefaultBackend(piBackend);

export type Conversation = {
  session: HarnessSession;
  queue: Promise<unknown>;
  /**
   * The provider/model the live session is currently pointed at. Tracked so a
   * real mid-conversation switch can be detected — on the web the picker applies
   * a switch via `setSettings`, which alone does NOT move the cached session.
   */
  provider: string;
  model: string;
  /**
   * The wire id of the turn EXECUTING right now (undefined between turns).
   * cancelTurn stamps it on the "Stopped by user" terminal frame so the stop
   * settles the turn it actually interrupts, not whatever a client guesses.
   */
  turnId?: string;
};

/** Live sessions by conversation id (module state — one workspace per process). */
export const conversations = new Map<string, Conversation>();

export async function getConversation(id: string): Promise<Conversation> {
  const existing = conversations.get(id);
  if (existing) return existing;

  // The model the session is built with — recorded on the Conversation so a
  // later turn can detect when the active provider/model changed under it.
  const builtModel = resolveModel();
  // Resolve the provider's backend (pi by default) and open the conversation's
  // session through it. The backend rehydrates prior turns from disk when the
  // conversation already exists — see createPiBackend.
  const session = await backendFor(builtModel.provider).createSession({
    conversationId: id,
    model: builtModel,
  });

  const conv: Conversation = {
    session,
    queue: Promise.resolve(),
    provider: builtModel.provider,
    model: builtModel.id,
  };
  conversations.set(id, conv);
  return conv;
}

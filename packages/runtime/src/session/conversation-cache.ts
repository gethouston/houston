import { join } from "node:path";
import {
  type AgentSession,
  createAgentSession,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { resolveModel } from "../ai/providers";
import { authStorage, modelRegistry } from "../auth/storage";
import { config } from "../config";
import { makeAgentLoader } from "./resource-loader";
import { buildToolSelection } from "./tool-selection";
import { makeClampedFileTools } from "./tools/clamped-fs";
import { makeIdTokenProvider } from "./tools/gcp-id-token";
import { makeIntegrationTools } from "./tools/integrations";
import { makeRunCodeTool } from "./tools/run-code";

/**
 * The long-lived server's per-conversation pi-session cache: the tool wiring
 * shared by every session, the Conversation record (session + turn queue +
 * the tracked provider/model + the executing turn's id), and the lazy
 * build/rehydrate. Turn execution lives in exec-turn.ts; the public turn API
 * (run/cancel/dispose) in chat.ts.
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

export type Conversation = {
  session: AgentSession;
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

  const loader = makeAgentLoader(config.workspaceDir);
  await loader.reload();

  // Continue this conversation's pi session if one is already on disk, else start
  // fresh. `create()` would mint a brand-new empty session every time, so a fresh
  // process (runtime restart, or a cloud sandbox woken from sleep) would silently
  // lose all prior turns. `continueRecent()` reopens the most recent session in
  // this conversation's dedicated dir, and createAgentSession rehydrates the
  // agent's message history from it (see SDK: hasExistingSession → agent.state.messages).
  const sessionManager = SessionManager.continueRecent(
    config.workspaceDir,
    join(config.dataDir, "sessions", id),
  );

  // The model the session is built with — recorded on the Conversation so a
  // later turn can detect when the active provider/model changed under it.
  const builtModel = resolveModel();
  const { session } = await createAgentSession({
    cwd: config.workspaceDir,
    agentDir: config.dataDir,
    model: builtModel, // active provider's model (Claude or Codex)
    authStorage,
    modelRegistry,
    sessionManager,
    resourceLoader: loader,
    tools: toolSelection.toolNames,
    customTools: [
      ...fileTools,
      ...(runCodeTool ? [runCodeTool] : []),
      ...integrationTools,
    ],
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

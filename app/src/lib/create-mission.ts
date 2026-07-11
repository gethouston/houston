/**
 * createMission — single source of truth for creating a new activity and
 * kicking off its Claude session. Used by both the desktop board-tab UI
 * and the mobile sync responder so the flow stays identical.
 */

import { isAgentProvisioning } from "../stores/agent-provisioning";
import { analytics } from "./analytics";
import { createMissionWhileWarming } from "./create-mission-warming";
import { logger } from "./logger";
import { fallbackMissionTitle, refreshMissionTitle } from "./mission-title";
import { tauriActivity, tauriChat } from "./tauri";

/** Build a session key for a given activity id. */
function sessionKeyForActivity(activityId: string): string {
  return `activity-${activityId}`;
}
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Minimal Conversation shape consumed by createMission. Loosely based on
 * the legacy `@houston-ai/sync-protocol` type; kept local so the desktop
 * compiles without the deleted package.
 */
export interface Conversation {
  id: string;
  title: string;
  description?: string;
  agentName: string;
  agentColor?: string;
  status: string;
  updatedAt: string;
  agentPath: string;
}

/**
 * Derive an activity title from the user's message.
 * - Trims whitespace; empty input becomes "New mission".
 * - Truncates to ~40 chars on a word boundary and appends an ellipsis if
 *   the message was longer.
 */
export function autoTitleFromText(text: string): string {
  return fallbackMissionTitle(text);
}

export interface CreateMissionAgent {
  id: string;
  name: string;
  color?: string;
  folderPath: string;
}

export interface CreateMissionOptions {
  /** Sub-agent mode id to store with the activity row. */
  agentMode?: string;
  /**
   * Builds the prompt actually sent to Claude, given the freshly-created
   * activity id. Defaults to returning the user's raw `text`. The board-tab
   * uses this to save attachments under `activity-{id}` and then append
   * their absolute paths to the prompt — all without changing the
   * user-visible description stored on the activity row.
   */
  buildPrompt?: (activityId: string) => Promise<string> | string;
  /** Prompt-file override forwarded to tauriChat.send (agent mode). */
  promptFile?: string;
  /** Provider override forwarded to tauriChat.send. */
  providerOverride?: string;
  /** Model override forwarded to tauriChat.send. */
  modelOverride?: string;
  /** Reasoning-effort override forwarded to tauriChat.send. */
  effortOverride?: string;
  /** Per-turn mode pin (composer "Mode" selector) forwarded to tauriChat.send. */
  modeOverride?: "execute" | "plan" | "auto";
  /**
   * Explicit activity title. Overrides the default `autoTitleFromText(text)`.
   * Used by action invocations where `text` is a structured marker that
   * should not bleed into the kanban card title.
   */
  title?: string;
  /** Source text used for async AI title generation. Defaults to `text`. */
  titleText?: string;
}

export interface CreateMissionResult {
  /** Activity id returned by the backend. */
  conversationId: string;
  /** Derived session key (`activity-{id}`). */
  sessionKey: string;
  /** Wire-ready Conversation payload for the mobile list. */
  conversation: Conversation;
}

/**
 * Create an activity under the given agent and start its Claude session.
 * If prompt preparation or session start fails, remove the just-created
 * activity so the board never keeps a fake "running" mission.
 */
export async function createMission(
  agent: CreateMissionAgent,
  text: string,
  opts: CreateMissionOptions = {},
): Promise<CreateMissionResult> {
  // A warming engine holds the activity write for the whole cold start —
  // awaiting it would freeze the composer with the user's text still in it
  // (HOU-693). The warming path answers immediately instead.
  if (isAgentProvisioning(agent.id)) {
    return createMissionWhileWarming(agent, text, opts);
  }
  const titleText = opts.titleText ?? text;
  const title = opts.title ?? fallbackMissionTitle(titleText);
  const description = text;

  const item = await tauriActivity.create(
    agent.folderPath,
    title,
    description,
    opts.agentMode,
    opts.providerOverride,
    opts.modelOverride,
  );
  const conversationId = item.id;
  const sessionKey = sessionKeyForActivity(conversationId);

  try {
    const prompt = opts.buildPrompt
      ? await opts.buildPrompt(conversationId)
      : text;

    await tauriChat.send(agent.folderPath, prompt, sessionKey, {
      mode: opts.promptFile,
      providerOverride: opts.providerOverride,
      modelOverride: opts.modelOverride,
      effortOverride: opts.effortOverride,
      modeOverride: opts.modeOverride,
      // `buildPrompt` swaps in a prompt the user should not see (a hidden setup
      // directive, or attachment paths appended to their words) — so the bubble
      // renders the clean `text` instead, live and on every history reload.
      displayText: opts.buildPrompt ? text : undefined,
    });

    analytics.track("mission_created", { agent_mode: opts.agentMode });

    if (!opts.title) {
      void refreshMissionTitle({
        agentPath: agent.folderPath,
        activityId: conversationId,
        text: titleText,
        provider: opts.providerOverride,
        model: opts.modelOverride,
      });
    }
  } catch (e) {
    try {
      await tauriActivity.delete(agent.folderPath, conversationId);
    } catch (cleanupErr) {
      logger.error(`[create-mission] rollback failed: ${cleanupErr}`);
    }
    throw e;
  }

  const conversation: Conversation = {
    id: conversationId,
    title,
    description,
    agentName: agent.name,
    agentColor: agent.color,
    status: "running",
    updatedAt: nowIso(),
    agentPath: agent.folderPath,
  };

  return { conversationId, sessionKey, conversation };
}

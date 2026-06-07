/**
 * App-side helpers for the encoded "user ran a Skill" chat message.
 *
 * Decoding + types are owned by `@houston-ai/chat` so the desktop and
 * mobile UIs render the same card. This file keeps the encoder and the
 * provider invoke-prompt assembler — pieces only the desktop needs since
 * mobile doesn't currently send Skills, only display them.
 *
 * Persisted format (single line + body):
 *
 *     <!--houston:skill {"skill":"...","message":"..."}-->
 *
 *     Use the X skill. Read .agents/skills/X/SKILL.md and follow its procedure.
 *
 *     Optional user text.
 */

import {
  decodeSkillMessage as decodeSkillMessageFromChat,
  type AttachmentReference,
  type SkillInvocation,
  type SkillInvocationField,
} from "@houston-ai/chat";
import type { SkillSummary } from "./types";
import { humanizeSkillName } from "./humanize-skill-name";

export type { SkillInvocation, SkillInvocationField };

/** Re-export so existing app callers don't need to know the new home. */
export const decodeSkillMessage = decodeSkillMessageFromChat;

const MARKER_PREFIX = "<!--houston:skill ";
const MARKER_SUFFIX = "-->";

/**
 * Wrap an explicit Claude prompt with the Skill marker so the chat
 * renderer can show a card and the engine can persist a single value.
 */
export function encodeSkillMessage(
  skill: SkillSummary,
  userText: string,
  claudePrompt: string,
  attachments: readonly AttachmentReference[] = [],
): string {
  const trimmedText = userText.trim();
  const payload: SkillInvocation = {
    skill: skill.name,
    displayName: humanizeSkillName(skill.name),
    image: skill.image,
    description: skill.description,
    integrations: skill.integrations,
    fields: [],
    message: trimmedText,
    attachments: [...attachments],
  };
  const json = JSON.stringify(payload);
  return `${MARKER_PREFIX}${json}${MARKER_SUFFIX}\n\n${claudePrompt}`;
}

/**
 * Build the explicit prompt sent to the provider for a Skill invocation.
 * Always names the skill and SKILL.md path so invocation is deterministic
 * across Claude, Codex, and OpenRouter. Structured inputs and prompt
 * templates are legacy metadata and are ignored.
 */
export function buildSkillClaudePrompt(
  skill: SkillSummary,
  userText: string,
): string {
  const trimmed = userText.trim();
  const invokeLine = `Use the ${skill.name} skill. Read .agents/skills/${skill.name}/SKILL.md and follow its procedure.`;
  if (!trimmed) return invokeLine;
  return `${invokeLine}\n\n${trimmed}`;
}

/** Alias for callers that prefer provider-neutral naming. */
export const buildSkillInvokePrompt = buildSkillClaudePrompt;

/**
 * App-side helpers for the encoded "user ran a Skill" chat message.
 *
 * Decoding + types are owned by `@houston-ai/chat` so the desktop and
 * mobile UIs render the same card. This file keeps the encoder and the
 * Claude-prompt assembler — pieces only the desktop needs since mobile
 * doesn't currently send Skills, only display them.
 *
 * Persisted format (single line + body):
 *
 *     <!--houston:skill {"skill":"...","message":"..."}-->
 *
 *     Use the X skill.
 *
 *     Optional user text.
 */

import {
  type AttachmentReference,
  decodeSkillMessage as decodeSkillMessageFromChat,
  type SkillInvocation,
  type SkillInvocationField,
} from "@houston-ai/chat";
import type { SkillCopy } from "./localize-skill-copy";
import type { SkillSummary } from "./types";

export type { SkillInvocation, SkillInvocationField };

/** Re-export so existing app callers don't need to know the new home. */
export const decodeSkillMessage = decodeSkillMessageFromChat;

const MARKER_PREFIX = "<!--houston:skill ";
const MARKER_SUFFIX = "-->";

/**
 * Wrap an explicit Claude prompt with the Skill marker so the chat
 * renderer can show a card and the engine can persist a single value.
 *
 * `copy` is the localized display copy (see `localizeSkillCopy`); it is
 * captured into the persisted marker, so the card renders in the language
 * the user sent the Skill in.
 */
export function encodeSkillMessage(
  skill: SkillSummary,
  copy: SkillCopy,
  userText: string,
  claudePrompt: string,
  attachments: readonly AttachmentReference[] = [],
): string {
  const trimmedText = userText.trim();
  const payload: SkillInvocation = {
    skill: skill.name,
    displayName: copy.title,
    image: skill.image,
    description: copy.description,
    integrations: skill.integrations,
    fields: [],
    message: trimmedText,
    attachments: [...attachments],
  };
  const json = JSON.stringify(payload);
  return `${MARKER_PREFIX}${json}${MARKER_SUFFIX}\n\n${claudePrompt}`;
}

/**
 * Build the explicit prompt sent to Claude for a Skill invocation.
 * Always names the skill so invocation is deterministic. Structured
 * inputs and prompt templates are legacy metadata and are ignored.
 */
export function buildSkillClaudePrompt(
  skill: SkillSummary,
  userText: string,
): string {
  const trimmed = userText.trim();
  if (!trimmed) return `Use the ${skill.name} skill.`;
  return `Use the ${skill.name} skill.\n\n${trimmed}`;
}

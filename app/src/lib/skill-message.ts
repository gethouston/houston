import {
  type AttachmentReference,
  decodeSkillMessage as decodeSkillMessageFromChat,
  type SkillInvocation,
  type SkillInvocationField,
} from "@houston-ai/chat";
import { skillDisplayTitle } from "./humanize-skill-name";
import type { SkillSummary } from "./types";

export type { SkillInvocation, SkillInvocationField };

export const decodeSkillMessage = decodeSkillMessageFromChat;

const MARKER_PREFIX = "<!--houston:skill ";
const MARKER_SUFFIX = "-->";

export function encodeSkillMessage(
  skill: SkillSummary,
  userText: string,
  claudePrompt: string,
  attachments: readonly AttachmentReference[] = [],
): string {
  const trimmedText = userText.trim();
  const payload: SkillInvocation = {
    skill: skill.name,
    displayName: skillDisplayTitle(skill),
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

export function buildSkillClaudePrompt(
  skill: SkillSummary,
  userText: string,
): string {
  const trimmed = userText.trim();
  if (!trimmed) return `Use the ${skill.name} skill.`;
  return `Use the ${skill.name} skill.\n\n${trimmed}`;
}

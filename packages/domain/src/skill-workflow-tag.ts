import type { SkillStepIntegration } from "@houston/protocol";

const TAG = /^\[([^\]\n]*)\]\s*/;
const TOOLKIT = /^[0-9_-]*[A-Za-z][A-Za-z0-9_-]*$/;
const ACTION = /^[A-Za-z0-9_]+$/;

export function takeIntegrationTag(text: string): {
  rest: string;
  integration: SkillStepIntegration | null;
} {
  const trimmed = text.trimStart();
  const match = trimmed.match(TAG);
  const integration = match?.[1] === undefined ? null : parseTag(match[1]);
  if (!match || !integration) return { rest: text, integration: null };
  return { rest: trimmed.slice(match[0].length), integration };
}

function parseTag(body: string): SkillStepIntegration | null {
  const [toolkit, action, ...extra] = body.split(":");
  if (extra.length > 0 || toolkit === undefined || !TOOLKIT.test(toolkit))
    return null;
  if (action === undefined)
    return { toolkit: toolkit.toLowerCase(), action: null };
  if (!ACTION.test(action)) return null;
  return { toolkit: toolkit.toLowerCase(), action: action.toUpperCase() };
}

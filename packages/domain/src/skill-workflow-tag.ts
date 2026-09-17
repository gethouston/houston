import type { SkillStepIntegration } from "@houston/protocol";

/**
 * A step's connected-app tag: `[toolkit]` or `[toolkit:ACTION]`, written right
 * after the bold title (`1. **Send the digest** [gmail:GMAIL_SEND_EMAIL] - …`).
 * It names the app the step acts on so the agent runs the action instead of
 * searching for it, and the app's icon can ride the step in the UI.
 *
 * Recognition is deliberately strict: bracketed text that is not a well-formed
 * slug pair is prose the author wrote (`[draft]`, `[Gmail Send]`), so it stays
 * in the step verbatim and the step carries no integration.
 */
const TAG = /^\[([^\]\n]*)\]\s*/;
/**
 * Composio toolkit slug, matched case-insensitively and stored lowercase. At
 * least one letter is required: a bare number right after a title is a year or
 * a citation the author wrote (`**Revenue** [2024]`), never an app.
 */
const TOOLKIT = /^[A-Za-z0-9_-]*[A-Za-z][A-Za-z0-9_-]*$/;
/** Action slug as `integration_execute` takes it, stored uppercase. */
const ACTION = /^[A-Za-z0-9_]+$/;

/**
 * Pulls a leading tag off the text that follows a step's bold title. Returns
 * the text with the tag removed plus the integration it named, or the text
 * untouched with a null integration when there is no well-formed tag.
 */
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

import type { FeedItem } from "@houston-ai/chat";
import {
  integrationExecuteSucceeded,
  isIntegrationExecuteCall,
} from "../../integration-execute.ts";
import type { EmailToolkit } from "./email-sender.ts";

/**
 * Whether a task's conversation shows the email going out, and through which
 * app. Pure, so it unit-tests without React
 * (`app/tests/academy-email-sent.test.ts`).
 *
 * The proof is the app's own answer, never the AI Employee's prose: an
 * `integration_execute` call whose action is a Gmail or Outlook send, paired
 * with the app's own answer to it ({@link integrationExecuteSucceeded}). A
 * send that fails is the AI Employee's to explain in the chat, where the user
 * answers it like any task.
 */

type EmailToolkitSlug = EmailToolkit["toolkit"];

/**
 * A send action, as the integrations catalog names them: `GMAIL_SEND_EMAIL`,
 * `GMAIL_SEND_DRAFT`, `OUTLOOK_SEND_EMAIL`, `OUTLOOK_OUTLOOK_SEND_EMAIL`.
 */
const SEND_ACTION_RE = /^(GMAIL|OUTLOOK)_(?:[A-Z]+_)*SEND_(?:EMAIL|DRAFT)$/i;

interface Call {
  name: string;
  input: unknown;
  result: { content: string; is_error: boolean } | null;
}

/**
 * Pairs calls with results the way the chat renders them: a result belongs to
 * the most recent call still without one, and a call streamed as a null-input
 * placeholder is completed by its twin rather than counted twice.
 */
function pairCalls(feed: readonly FeedItem[]): Call[] {
  const calls: Call[] = [];
  for (const item of feed) {
    if (item.feed_type === "tool_call") {
      const last = calls[calls.length - 1];
      if (
        last &&
        last.result === null &&
        last.input == null &&
        last.name === item.data.name
      ) {
        last.input = item.data.input;
      } else {
        calls.push({ ...item.data, result: null });
      }
    } else if (item.feed_type === "tool_result") {
      const open = calls.findLast((call) => call.result === null);
      if (open) open.result = item.data;
    }
  }
  return calls;
}

/** The email app a call's action sends through, or null for any other action. */
function sendingToolkit(input: unknown): EmailToolkitSlug | null {
  if (typeof input !== "object" || input === null) return null;
  const { action } = input as { action?: unknown };
  if (typeof action !== "string") return null;
  const match = SEND_ACTION_RE.exec(action.trim());
  if (match === null) return null;
  return match[1].toUpperCase() === "GMAIL" ? "gmail" : "outlook";
}

/** The app the conversation's first successful email send went through, or null. */
export function emailSentVia(
  feed: readonly FeedItem[],
): EmailToolkitSlug | null {
  for (const call of pairCalls(feed)) {
    if (!isIntegrationExecuteCall(call.name)) continue;
    if (!integrationExecuteSucceeded(call.result)) continue;
    const toolkit = sendingToolkit(call.input);
    if (toolkit !== null) return toolkit;
  }
  return null;
}

import type { FeedItem } from "@houston-ai/chat";
import {
  integrationExecuteSucceeded,
  isIntegrationExecuteCall,
} from "../../integration-execute.ts";
import type { EmailToolkit } from "./email-sender.ts";

type EmailToolkitSlug = EmailToolkit["toolkit"];

const SEND_ACTION_RE = /^(GMAIL|OUTLOOK)_(?:[A-Z]+_)*SEND_(?:EMAIL|DRAFT)$/i;

interface Call {
  name: string;
  input: unknown;
  result: { content: string; is_error: boolean } | null;
}

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

function sendingToolkit(input: unknown): EmailToolkitSlug | null {
  if (typeof input !== "object" || input === null) return null;
  const { action } = input as { action?: unknown };
  if (typeof action !== "string") return null;
  const match = SEND_ACTION_RE.exec(action.trim());
  if (match === null) return null;
  return match[1].toUpperCase() === "GMAIL" ? "gmail" : "outlook";
}

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

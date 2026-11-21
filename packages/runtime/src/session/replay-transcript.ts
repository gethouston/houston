import type { ChatMessage } from "@houston/runtime-client";

const REPLAY_FIT_FRACTION = 0.8;

const CHARS_PER_TOKEN = 4;

export function replayCharBudget(targetWindowTokens: number): number {
  return Math.max(
    0,
    Math.floor(targetWindowTokens * REPLAY_FIT_FRACTION) * CHARS_PER_TOKEN,
  );
}

export interface ReplayPreamble {
  text: string;
  truncated: boolean;
}

const HEADER =
  "[Continuing an existing conversation. The transcript below is what has " +
  "already been said in this chat; it ran on a different AI model before " +
  "switching to you. Continue seamlessly: keep all established context, do " +
  "not reintroduce yourself, and do not treat this as a new conversation.]";

const RESET_HEADER =
  "[Continuing an existing conversation. The transcript below is what has " +
  "already been said in this chat. Continue seamlessly: keep all established " +
  "context, do not reintroduce yourself, and do not treat this as a new " +
  "conversation.]";

const HEADERS = {
  switch: HEADER,
  reset: RESET_HEADER,
};

export type ReplayReason = keyof typeof HEADERS;

const TRUNCATION_NOTE =
  "(Earlier messages were omitted to fit your context window; the transcript below is the most recent part of the conversation.)";

const FOOTER = "[End of transcript. The user's next message follows.]";

function renderMessage(m: ChatMessage): string | null {
  const toolNames = (m.tools ?? []).map((t) => t.name);
  const body =
    m.content.trim() ||
    (toolNames.length ? `[performed actions: ${toolNames.join(", ")}]` : "");
  if (!body) return null;
  const speaker =
    m.role === "user"
      ? m.author?.name
        ? `User (${m.author.name})`
        : "User"
      : "Assistant";
  return `${speaker}: ${body}`;
}

export function renderReplayPreamble(
  messages: ReadonlyArray<ChatMessage>,
  currentTurnId: string,
  budget: number,
  reason: ReplayReason = "switch",
): ReplayPreamble | null {
  if (budget <= 0) return null;
  const lines: string[] = [];
  for (const m of messagesVisibleToTheModel(messages)) {
    if (m.role === "user" && m.turnId === currentTurnId) continue;
    const line = renderMessage(m);
    if (line) lines.push(line);
  }
  if (lines.length === 0) return null;

  const kept: string[] = [];
  let used = 0;
  let clipped = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (used + line.length > budget) {
      if (kept.length === 0) {
        kept.unshift(`…${line.slice(-budget)}`);
        clipped = true;
      }
      break;
    }
    kept.unshift(line);
    used += line.length + 1;
  }
  const truncated = clipped || kept.length < lines.length;
  return {
    text: [
      HEADERS[reason],
      ...(truncated ? [TRUNCATION_NOTE] : []),
      "",
      kept.join("\n\n"),
      "",
      FOOTER,
      "",
    ].join("\n"),
    truncated,
  };
}

export function messagesVisibleToTheModel(
  messages: ReadonlyArray<ChatMessage>,
): ReadonlyArray<ChatMessage> {
  for (let i = messages.length - 1; i >= 0; i--)
    if (messages[i].contextCleared) return messages.slice(i + 1);
  return messages;
}

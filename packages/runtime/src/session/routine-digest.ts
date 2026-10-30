import { routineRunPreamble } from "@houston/domain";
import type { ChatMessage } from "@houston/runtime-client";
import {
  messagesVisibleToTheModel,
  type ReplayPreamble,
} from "./replay-transcript";
import { estimateTokens } from "./token-estimate";

/** How an earlier turn of a routine chat ended. */
export type RoutineTurnOutcome =
  | { kind: "finished" }
  | { kind: "failed"; error: string }
  | { kind: "stopped" }
  | { kind: "interrupted" }
  | { kind: "no_reply" };

/** One earlier turn of a routine chat: a fire of the routine, or a person's message. */
export interface RoutineTurn {
  at: number;
  source: "run" | "person";
  /** What the person wrote; empty for a run, whose instructions follow anyway. */
  request: string;
  outcome: RoutineTurnOutcome;
  /** The turn's final reply, whole. */
  reply: string;
}

/** Turns the digest shows, newest first. */
const DIGEST_TURNS = 5;
const DIGEST_REPLY_CHARS = 600;
const DIGEST_REQUEST_CHARS = 200;
/** The digest's ceiling in conservatively estimated tokens. */
export const DIGEST_TOKEN_BUDGET = 2_000;

/** Turns the results file keeps, newest first, and its size ceiling. */
const RESULTS_TURNS = 50;
const RESULTS_MAX_CHARS = 200_000;

/**
 * Every fire opens with routineRunPreamble, whatever the routine is called, so
 * its fixed head tells a fire from a person's message without a stored flag.
 */
const FIRE_HEAD = routineRunPreamble("\u0000").split("\u0000")[0] ?? "";

/**
 * The earlier turns of a routine chat, oldest first, from its transcript tail.
 * Only what the model may still see counts (nothing above a `/clear`), and
 * `currentTurnId`'s own row is the prompt itself, never history.
 */
export function routineTurns(
  messages: ReadonlyArray<ChatMessage>,
  currentTurnId: string,
): RoutineTurn[] {
  const turns: RoutineTurn[] = [];
  let open: { user: ChatMessage; replies: ChatMessage[] } | null = null;
  const close = () => {
    if (open) turns.push(toTurn(open.user, open.replies));
    open = null;
  };
  for (const m of messagesVisibleToTheModel(messages)) {
    if (m.role === "user") {
      close();
      if (m.turnId !== currentTurnId) open = { user: m, replies: [] };
    } else if (m.role === "assistant") open?.replies.push(m);
  }
  close();
  return turns;
}

function toTurn(user: ChatMessage, replies: ChatMessage[]): RoutineTurn {
  const run = user.content.startsWith(FIRE_HEAD);
  const reply = replies.findLast((r) => r.content.trim())?.content.trim();
  const last = replies.at(-1);
  const outcome: RoutineTurnOutcome = last?.providerError
    ? { kind: "failed", error: last.providerError.kind }
    : last?.stopped
      ? { kind: "stopped" }
      : last?.interrupted
        ? { kind: "interrupted" }
        : reply
          ? { kind: "finished" }
          : { kind: "no_reply" };
  return {
    at: user.ts,
    source: run ? "run" : "person",
    request: run ? "" : (user.displayText ?? user.content).trim(),
    outcome,
    reply: reply ?? "",
  };
}

const OUTCOME_TEXT = {
  finished: "finished",
  stopped: "stopped by a person",
  interrupted: "interrupted",
  no_reply: "ended without a reply",
} as const;

function outcomeText(outcome: RoutineTurnOutcome): string {
  return outcome.kind === "failed"
    ? `failed (${outcome.error})`
    : OUTCOME_TEXT[outcome.kind];
}

const when = (turn: RoutineTurn) => new Date(turn.at).toISOString();

/** `text` on one line, cut to `max` characters (code points, never half a pair). */
function excerpt(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return chars.length <= max
    ? chars.join("")
    : `${chars
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`;
}

function digestLine(turn: RoutineTurn): string {
  const who =
    turn.source === "run"
      ? "run"
      : `a person wrote "${excerpt(turn.request, DIGEST_REQUEST_CHARS)}"`;
  const reply = turn.reply
    ? `: ${excerpt(turn.reply, DIGEST_REPLY_CHARS)}`
    : "";
  return `- ${when(turn)}, ${who}, ${outcomeText(turn.outcome)}${reply}`;
}

const DIGEST_HEADER =
  "[Earlier runs of this automation, newest first. This turn starts without " +
  "the rest of the chat: these lines are your memory of what earlier runs " +
  "found and reported, each reply shortened. Use them to avoid repeating " +
  "work or reports.]";
const DIGEST_FOOTER = "[End of earlier runs. This turn's message follows.]";

/**
 * The short memory a fresh routine session opens with: the newest turns, each
 * reply cut to an excerpt, within DIGEST_TOKEN_BUDGET (older lines go first),
 * plus where the full replies are when `resultsPath` names a readable file.
 * Null when the chat has no earlier turn.
 */
export function renderRoutineDigest(
  turns: ReadonlyArray<RoutineTurn>,
  resultsPath: string | null,
): ReplayPreamble | null {
  const lines = turns.slice(-DIGEST_TURNS).reverse().map(digestLine);
  const pointer = resultsPath
    ? [
        `The full replies of earlier runs are in the file ${resultsPath}, newest first. Read it only if this run needs more than the lines above.`,
      ]
    : [];
  const render = (kept: string[]) =>
    [DIGEST_HEADER, ...kept, ...pointer, DIGEST_FOOTER, ""].join("\n");
  while (
    lines.length > 0 &&
    estimateTokens(render(lines)) > DIGEST_TOKEN_BUDGET
  )
    lines.pop();
  if (lines.length === 0) return null;
  return { text: render(lines), truncated: lines.length < turns.length };
}

/**
 * The file the digest points at: the newest turns' full replies, newest
 * first, at most RESULTS_TURNS of them and RESULTS_MAX_CHARS in all.
 */
export function renderRoutineResults(
  turns: ReadonlyArray<RoutineTurn>,
): string {
  let text =
    "# Earlier runs of this automation\n\nNewest first. Each section is one earlier turn of the chat with its full final reply.\n";
  for (const turn of turns.slice(-RESULTS_TURNS).reverse()) {
    const who = turn.source === "run" ? "run" : "a person's message";
    const section = [
      `\n## ${when(turn)}, ${who}, ${outcomeText(turn.outcome)}\n`,
      ...(turn.request ? [`Message: ${turn.request}\n`] : []),
      `${turn.reply || "(no reply)"}\n`,
    ].join("\n");
    if (text.length + section.length > RESULTS_MAX_CHARS) break;
    text += section;
  }
  return text;
}

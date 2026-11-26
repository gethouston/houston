// `.ts` extensions so the node test runner can import this module directly.
import type {
  ConversationImportMessage,
  ConversationImportRequest,
} from "@houston/wire-types";
import { encodeInteractionAnswers } from "../interaction-answers-marker.ts";
import { encodeTeamCard } from "./onboarding-card-markers.ts";
import type { ScriptLine } from "./script-types.ts";

/** Which onboarding conversation the manager ran. */
export type OnboardingConversation = "first_run" | "profile_completion";

type ManagerLine = Extract<ScriptLine, { kind: "manager" }>;
type Receipt = Extract<ScriptLine, { kind: "receipt" }>;

/** The words each line was shown in: the conversation's own copy. */
export interface TranscriptCopy {
  manager(line: ManagerLine): string;
  receipt(line: Receipt): { question?: string; answer: string };
}

/**
 * The import's name, so completing a conversation twice writes it once. First
 * run happens once per account. The profile questions can come back in a later
 * round (a question added since), so that import is named by the questions it
 * answered: a new round is a new import, a retry of the same one is not.
 */
export function onboardingImportId(
  conversation: OnboardingConversation,
  lines: readonly ScriptLine[],
): string {
  if (conversation === "first_run") return "onboarding:first_run";
  const asked = lines.flatMap((line) =>
    line.kind === "receipt"
      ? [line.question.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)]
      : [],
  );
  return ["onboarding:profile_completion", ...asked].join(":");
}

/**
 * An answer as the manager's chat keeps it: the receipt the person saw
 * (behind the interaction-answers marker, which the chat renders as that same
 * card) over the flat "question: answer" line the model reads, exactly like an
 * answered in-chat question.
 */
function answerMessage(receipt: { question?: string; answer: string }): string {
  if (receipt.question === undefined)
    return encodeInteractionAnswers(
      [{ answer: receipt.answer }],
      receipt.answer,
    );
  return encodeInteractionAnswers(
    [{ question: receipt.question, answer: receipt.answer }],
    `${receipt.question}: ${receipt.answer}`,
  );
}

/** A manager line as its chat keeps it: the team card behind its marker over
 *  the words the model reads, any other line as its words. */
function managerMessage(line: ManagerLine, copy: TranscriptCopy): string {
  const text = copy.manager(line);
  return line.id === "closingTeam"
    ? encodeTeamCard({ reach: line.reach ?? null }, text)
    : text;
}

/**
 * The finished onboarding conversation as the manager's real history: each
 * manager line an assistant message and each answer a user message, in the
 * order they were shown. Consecutive manager lines stay separate messages,
 * the bubbles the person watched arrive; the model reads history as a
 * transcript, so nothing needs the two roles to alternate.
 */
export function onboardingTranscript(
  conversation: OnboardingConversation,
  lines: readonly ScriptLine[],
  copy: TranscriptCopy,
): ConversationImportRequest {
  return {
    importId: onboardingImportId(conversation, lines),
    // First run is said before anything else in the manager's chat: one that
    // lands late (a retry on the next load) still reads first.
    ...(conversation === "first_run" ? { at: "start" as const } : {}),
    messages: lines.map((line): ConversationImportMessage =>
      line.kind === "manager"
        ? { role: "assistant", content: managerMessage(line, copy) }
        : { role: "user", content: answerMessage(copy.receipt(line)) },
    ),
  };
}

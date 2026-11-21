import type {
  ConversationImportMessage,
  ConversationImportRequest,
} from "@houston/wire-types";
import { encodeInteractionAnswers } from "../interaction-answers-marker.ts";
import { encodeTeamCard } from "./onboarding-card-markers.ts";
import type { ScriptLine } from "./script-types.ts";

export type OnboardingConversation = "first_run" | "profile_completion";

type ManagerLine = Extract<ScriptLine, { kind: "manager" }>;
type Receipt = Extract<ScriptLine, { kind: "receipt" }>;

export interface TranscriptCopy {
  manager(line: ManagerLine): string;
  receipt(line: Receipt): { question?: string; answer: string };
}

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

function managerMessage(line: ManagerLine, copy: TranscriptCopy): string {
  const text = copy.manager(line);
  return line.id === "closingTeam"
    ? encodeTeamCard({ reach: line.reach ?? null }, text)
    : text;
}

export function onboardingTranscript(
  conversation: OnboardingConversation,
  lines: readonly ScriptLine[],
  copy: TranscriptCopy,
): ConversationImportRequest {
  return {
    importId: onboardingImportId(conversation, lines),
    ...(conversation === "first_run" ? { at: "start" as const } : {}),
    messages: lines.map(
      (line): ConversationImportMessage =>
        line.kind === "manager"
          ? { role: "assistant", content: managerMessage(line, copy) }
          : { role: "user", content: answerMessage(copy.receipt(line)) },
    ),
  };
}

import { MessageResponse } from "@houston-ai/chat";
import { MissionDoneScreen } from "./mission-done-screen";

interface TryDoneScreenProps {
  brandLabel: string;
  assistantName: string;
  assistantColor: string;
  title: string;
  reportMarkdown: string;
  continueLabel: string;
  onContinue: () => void;
  skipLabel?: string;
  onSkip?: () => void;
}

/**
 * "First mission complete" celebration — the report Claude just wrote in
 * chat, presented prominently with the assistant's avatar above it. Just
 * a thin wrapper around the shared `MissionDoneScreen` so the Try, Skill,
 * Routine, and Summary done states all share the same chrome.
 */
export function TryDoneScreen({
  brandLabel,
  assistantName,
  assistantColor,
  title,
  reportMarkdown,
  continueLabel,
  onContinue,
  skipLabel,
  onSkip,
}: TryDoneScreenProps) {
  return (
    <MissionDoneScreen
      brandLabel={brandLabel}
      assistantName={assistantName}
      assistantColor={assistantColor}
      title={title}
      continueLabel={continueLabel}
      onContinue={onContinue}
      skipLabel={skipLabel}
      onSkip={onSkip}
    >
      <article className="prose prose-sm max-w-none rounded-xl border border-black/5 bg-secondary/30 p-6">
        <MessageResponse>{reportMarkdown}</MessageResponse>
      </article>
    </MissionDoneScreen>
  );
}

import { Button, cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { Check } from "lucide-react";
import type { LessonPanelProps } from "../lesson-panel";
import { LessonPanelFrame } from "../lesson-panel-frame";
import { useEmailLessonStore } from "./email-lesson-store";
import { EmailNoSender } from "./email-no-sender";
import { useEmailSender } from "./use-email-sender";

/**
 * Who sends the email: the current team's AI Employees, the first one already
 * picked, so a user with one AI Employee reads a confirmation rather than a
 * question.
 *
 * A team with nobody on it is offered a hire instead (`EmailNoSender`).
 */
export function EmailSenderPanel({ copy, onNext }: LessonPanelProps) {
  const { candidates, sender } = useEmailSender();
  const pick = useEmailLessonStore((s) => s.pick);

  if (sender === null) return <EmailNoSender />;

  return (
    <LessonPanelFrame title={copy.title} body={copy.body}>
      <div
        role="radiogroup"
        aria-label={copy.title}
        className="flex max-h-64 flex-col gap-1 overflow-y-auto"
      >
        {candidates.map((agent) => {
          const selected = agent.id === sender.id;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a styled row list, announced as the radio group it is.
            <button
              key={agent.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => pick(agent.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors duration-200 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                selected && "bg-hover",
              )}
            >
              <HoustonAvatar
                color={resolveAgentColor(agent.color)}
                diameter={32}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {agent.name}
              </span>
              {selected && <Check className="size-4 text-ink" aria-hidden />}
            </button>
          );
        })}
      </div>
      <Button
        autoFocus
        className="self-end rounded-full active:scale-[0.96]"
        onClick={() => {
          // The default is a real choice too: hold it, so the next beat sends
          // from exactly the AI Employee this one showed.
          pick(sender.id);
          onNext();
        }}
      >
        {copy.cta ?? ""}
      </Button>
    </LessonPanelFrame>
  );
}

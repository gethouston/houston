import type { InteractionAnswersPayload } from "./interaction-answers-message.ts";

interface UserInteractionAnswersMessageProps {
  payload: InteractionAnswersPayload;
}

export function UserInteractionAnswersMessage({
  payload,
}: UserInteractionAnswersMessageProps) {
  return (
    <div className="flex max-w-md flex-col items-end">
      <div className="inline-block max-w-full divide-y divide-line/50 rounded-2xl bg-chip px-4 py-1 text-left">
        {payload.lines.map((line, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: order-stable render list
            key={index}
            className="flex flex-col gap-0.5 py-2.5"
          >
            {line.question !== undefined && (
              <span className="text-xs leading-5 text-ink-muted">
                {line.question}
              </span>
            )}
            <span className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-ink">
              {line.answer}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

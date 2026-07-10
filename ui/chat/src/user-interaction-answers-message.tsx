import type { InteractionAnswersPayload } from "./interaction-answers-message.ts";

interface UserInteractionAnswersMessageProps {
  payload: InteractionAnswersPayload;
}

/**
 * Read-only card rendered in place of a plain user_message body when the user
 * finished an `ask_user` interaction sequence. Reads as a quiet receipt: each
 * answered question is a small muted label with the user's answer directly
 * below, and successive pairs are separated by a hairline divider for an even
 * rhythm (a lone pair simply reads as a deliberate compact receipt, no
 * divider). A non-question line (a connected app, a signin confirmation) shows
 * as a single value line. Sits in the right column of the conversation where
 * user bubbles live, styled quieter than the interaction card. Content is
 * pass-through data, so no i18n labels are needed.
 */
export function UserInteractionAnswersMessage({
  payload,
}: UserInteractionAnswersMessageProps) {
  return (
    <div className="flex max-w-md flex-col items-end">
      <div className="inline-block max-w-full divide-y divide-border/50 rounded-2xl bg-secondary px-4 py-1 text-left">
        {payload.lines.map((line, index) => (
          <div
            // Lines are an ordered, stable list rebuilt only on new messages;
            // there is no better key than position for these pass-through rows.
            // biome-ignore lint/suspicious/noArrayIndexKey: order-stable render list
            key={index}
            className="flex flex-col gap-0.5 py-2.5"
          >
            {line.question !== undefined && (
              <span className="text-xs leading-5 text-muted-foreground">
                {line.question}
              </span>
            )}
            <span className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-foreground">
              {line.answer}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

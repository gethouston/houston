import type { InteractionAnswersPayload } from "./interaction-answers-message.ts";

interface UserInteractionAnswersMessageProps {
  payload: InteractionAnswersPayload;
}

/**
 * Read-only card rendered in place of a plain user_message body when the user
 * finished an `ask_user` interaction sequence. Each answered question shows as
 * a small muted line with the user's answer in bold directly below; a
 * non-question line (a connected app, a signin confirmation) shows as a single
 * bold line. Sits in the right column of the conversation where user bubbles
 * live, matching the Skill / attachment bubble family. Content is pass-through
 * data, so no i18n labels are needed.
 */
export function UserInteractionAnswersMessage({
  payload,
}: UserInteractionAnswersMessageProps) {
  return (
    <div className="flex max-w-md flex-col items-end gap-2">
      <div className="inline-block max-w-full rounded-2xl bg-secondary px-4 py-3 text-left">
        <div className="flex flex-col gap-3">
          {payload.lines.map((line, index) => (
            <div
              // Lines are an ordered, stable list rebuilt only on new messages;
              // there is no better key than position for these pass-through rows.
              // biome-ignore lint/suspicious/noArrayIndexKey: order-stable render list
              key={index}
              className="flex flex-col gap-0.5"
            >
              {line.question !== undefined && (
                <span className="text-xs leading-5 text-muted-foreground">
                  {line.question}
                </span>
              )}
              <span className="whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-foreground">
                {line.answer}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import type { DecodedQuestionAnswerMessage } from "@houston-ai/chat";

export interface UserQuestionAnswerMessageLabels {
  title?: string;
}

interface Props {
  decoded: DecodedQuestionAnswerMessage;
  labels?: UserQuestionAnswerMessageLabels;
}

/**
 * Read-only bubble for a structured question answer. Shows the
 * human-readable text after the marker; the marker itself stays hidden.
 */
export function UserQuestionAnswerMessage({ decoded, labels }: Props) {
  const title = labels?.title ?? "Your answer";
  return (
    <div className="flex max-w-md flex-col items-end gap-2">
      <div className="inline-block rounded-2xl bg-secondary p-4 text-left">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          {title}
        </div>
        {decoded.text.trim().length > 0 ? (
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
            {decoded.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

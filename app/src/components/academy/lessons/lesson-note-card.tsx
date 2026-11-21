import { Button } from "@houston-ai/core";

export function LessonNoteCard({
  title,
  body,
  cta,
  onNext,
}: {
  title: string;
  body?: string;
  cta: string;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-medium text-balance text-ink">{title}</h2>
        {body && (
          <p className="mt-1 text-sm text-balance text-ink-muted">{body}</p>
        )}
      </div>
      <Button
        autoFocus
        className="shrink-0 rounded-full active:scale-[0.96]"
        onClick={onNext}
      >
        {cta}
      </Button>
    </div>
  );
}

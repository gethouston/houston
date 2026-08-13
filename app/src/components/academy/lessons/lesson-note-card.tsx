import { Button } from "@houston-ai/core";

/**
 * A lesson's narration beat: what is about to happen, and the one word that
 * moves on.
 *
 * The same row the video beat ends on — words left, action right — so the two
 * docked beats read as one surface changing its contents rather than two
 * different cards. Nothing is centred and nothing is crowned: a lesson-local
 * card on purpose, because the guided setup's centred narration card
 * (`TutorialCenterCard`) is the FIRST thing a new user ever sees and must not
 * move.
 */
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

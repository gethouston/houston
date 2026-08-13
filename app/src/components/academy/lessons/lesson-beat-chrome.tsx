import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { TutorialDismissButton } from "../../tutorial";

/**
 * The two things every beat of a lesson owes the user, worn by the beat's own
 * surface: where they are, and the way out.
 *
 * It rides the surface that is moving — the docked panel, the whisper beside a
 * control — so the exit is always on the thing the eye is already on, and never
 * in a corner of the window the user has to go looking for. Deliberately tiny:
 * a quiet count and a close, no step list and no progress bar, because a lesson
 * is three or four beats long and a map of it would weigh more than the walk.
 *
 * The count is drawn as numerals and SPOKEN as a sentence: "3 / 4" reads as
 * "three slash four" to a screen reader, which is not what it means.
 */
export function LessonBeatChrome({
  position,
  total,
  onExit,
  className,
}: {
  /** The beat that is playing, 1-based. */
  position: number;
  total: number;
  onExit: () => void;
  className?: string;
}) {
  const { t } = useTranslation("academy");
  const counts = { current: position, total };

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <p className="text-xs text-ink-muted tabular-nums">
        <span className="sr-only">{t("lessons.progress", counts)}</span>
        <span aria-hidden>{t("lessons.stepCount", counts)}</span>
      </p>
      <TutorialDismissButton
        label={t("lessons.exit")}
        onDismiss={onExit}
        // In the flow of the row rather than pinned to a corner, and pulled out
        // by its own hover plate's padding so the icon lines up with the
        // surface's edge instead of floating 6px inside it.
        className="pointer-events-auto relative -m-1.5 shrink-0"
      />
    </div>
  );
}

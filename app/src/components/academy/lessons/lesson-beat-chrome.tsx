import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { TutorialDismissButton } from "../../tutorial";

export function LessonBeatChrome({
  position,
  total,
  onExit,
  className,
}: {
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
        className="pointer-events-auto relative -m-1.5 shrink-0"
      />
    </div>
  );
}

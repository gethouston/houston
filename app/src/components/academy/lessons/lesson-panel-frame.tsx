import type { ReactNode } from "react";

/**
 * The words every panel beat opens with, set the way the note card sets them
 * (`lesson-note-card.tsx`), over whatever the panel asks the user to do. One
 * frame, so the lesson's docked beats read as one surface changing its
 * contents rather than as a different card per panel.
 */
export function LessonPanelFrame({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-medium text-balance text-ink">{title}</h2>
        <p className="mt-1 text-sm text-balance text-ink-muted">{body}</p>
      </div>
      {children}
    </div>
  );
}

import { Dialog, DialogContent } from "@houston-ai/core";
import type { ReactNode } from "react";
import { LessonBeatChrome } from "./lesson-beat-chrome";

/**
 * A lesson's WATCH and LISTEN beats stand on the one shared dialog frame:
 * modal, with focus trapped inside and the app behind it inert.
 *
 * The scrim belongs to the frame; the count and the exit belong to the
 * chrome, in the same place for both docked beats. Those are the only ways
 * out: a stray click beside a playing video must not abandon the beat, and
 * Escape belongs to the runner (which takes it for the whisper beat too, and
 * only when it is the user's own key), so no Radix path ends the lesson.
 * The beat's own control takes focus as it opens.
 */
export function LessonDockedPanel({
  label,
  position,
  total,
  onExit,
  children,
}: {
  /** Names the panel for a screen reader — the beat's own title. */
  label: string;
  /** The beat that is playing, 1-based, and how many there are. */
  position: number;
  total: number;
  onExit: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        aria-label={label}
        // The frame points both at a title and a description this panel does
        // not render; `aria-label` names it instead.
        aria-labelledby={undefined}
        aria-describedby={undefined}
        // The app's own housekeeping dispatches synthetic Escapes at open
        // modals (`keep-alive-views.tsx`); the runner ignores those, and so
        // must Radix.
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        // The card owns initial focus; prevent Radix from moving it to the
        // chrome's exit button. The dialog still traps Tab inside the panel.
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"
      >
        <LessonBeatChrome position={position} total={total} onExit={onExit} />
        {/* One grid item, so a beat made of several blocks keeps its own
            rhythm instead of taking the frame's gap between each of them. */}
        <div className="min-w-0">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

import type { ReactNode } from "react";
import { LessonBeatChrome } from "./lesson-beat-chrome";

/**
 * Where a lesson's WATCH and LISTEN beats sit: one calm panel docked in the
 * middle of a quieted app.
 *
 * Deliberately NOT a takeover. The dim is the app's own dialog scrim, even and
 * light, so the workspace stays legible behind it and the beat reads as a note
 * laid over the product rather than a second product opening on top of it. The
 * panel is the standard floating surface (solid `bg-dialog` +
 * `.ht-shadow-modal`), the same one every modal in the app stands on.
 *
 * The count and the way out are the panel's, not its contents' — both docked
 * beats stand on this one surface, so the exit sits in exactly the same place
 * whichever of them is playing.
 *
 * A `dialog` that is deliberately NOT `aria-modal`: the panel overlays the app
 * and does not inert it, and claiming modality a surface does not enforce is
 * what tells a screen reader nothing else exists while the page still says
 * otherwise. What a user in a hurry actually needs is honoured instead: the
 * beat's own control takes focus as it opens (`autoFocus` in the cards) and
 * Escape leaves the lesson from any beat (the runner owns that key, so the
 * whisper beat answers to it too).
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
    <div
      role="dialog"
      aria-label={label}
      // Above shell chrome (≤ z-30), below the dialog/toast layer.
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/25 p-6 duration-200 animate-in fade-in-0 motion-reduce:animate-none"
    >
      <div className="ht-shadow-modal flex max-h-full w-full max-w-lg flex-col overflow-y-auto rounded-2xl bg-dialog p-6 duration-200 ease-out animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none">
        <LessonBeatChrome
          position={position}
          total={total}
          onExit={onExit}
          className="mb-4 shrink-0"
        />
        {children}
      </div>
    </div>
  );
}

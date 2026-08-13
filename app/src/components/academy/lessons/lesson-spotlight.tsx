import { cn } from "@houston-ai/core";
import {
  type CardSize,
  placeCard,
  TutorialSpotlightVeil,
  useSpotlightRects,
} from "../../tutorial";
import { LessonBeatChrome } from "./lesson-beat-chrome";

/**
 * A lesson's DO-IT beat: the app dims, the real control stays lit, and ONE
 * sentence whispers beside it.
 *
 * There is no coach card. What the whisper carries is only what has to be read
 * here and now — the sentence, the count, and the way out — on a quiet popover
 * surface beside the control. No buttons that move the lesson on: the interface
 * itself is the next click.
 *
 * The copy area stays click-through, so the control it points at is reachable
 * even where the two overlap; the close is the one thing on it that takes a
 * click.
 *
 * A beat that is not `armed` yet ({@link import("./lesson-arming").lessonBeatArmed})
 * shows the same whisper over an UNBROKEN veil: no hole, no cues, and the
 * blockers covering the viewport, exactly as they do while the target is off
 * screen. The taught click is therefore impossible until the beat can see it,
 * which is the difference between a lesson that waits a moment and a lesson
 * that strands the user on a step they already did.
 *
 * The veil is the same one the guided setup wears (composed, not restyled — the
 * mandatory setup must stay exactly as it is); this file is only the whisper
 * and the placement it needs.
 */

/** The whisper's box: one sentence over the count-and-close row. */
const WHISPER: CardSize = { w: 260, h: 96 };

export function LessonSpotlight({
  selector,
  whisper,
  armed,
  inDialog,
  position,
  total,
  onExit,
}: {
  /** Selector of the control the beat is about. */
  selector: string;
  /** The one sentence, already translated. */
  whisper?: string;
  /** Whether the beat can see the click yet. False holds the veil whole. */
  armed: boolean;
  /** The target lives inside an open modal dialog: the whole step lifts above
   *  the dialog layer and the blockers stay off (the dialog is already modal). */
  inDialog?: boolean;
  /** The beat that is playing, 1-based, and how many there are. */
  position: number;
  total: number;
  onExit: () => void;
}) {
  const {
    hole: measured,
    dialogRect,
    viewport,
  } = useSpotlightRects(selector, inDialog);
  // No hole until the beat can see the click: one full-viewport blocker, a
  // plain scrim, and no "click here" cues, all of it the veil's own
  // target-not-there behaviour rather than a second way to draw a step.
  const hole = armed ? measured : null;
  const place = placeCard({
    hole,
    dialogRect,
    viewport,
    inDialog: inDialog === true,
    size: WHISPER,
  });

  // Above the z-50 dialog layer for in-dialog beats, else above shell chrome
  // (≤ z-30) but below dialogs/toasts. Both literals, for the Tailwind JIT.
  const z = inDialog ? "z-[60]" : "z-40";

  return (
    <>
      <TutorialSpotlightVeil
        hole={hole}
        dialogRect={dialogRect}
        viewport={viewport}
        inDialog={inDialog === true}
        showCues
        fadeIn
        z={z}
      />
      {/* Solid popover surface, per the floating-surfaces doctrine: it sits
          over the app and must never bleed it through. `pointer-events-none`
          keeps the surface out of the way of the control it points at — the
          close inside it takes its own events back. */}
      <div
        className={cn(
          "ht-shadow-modal pointer-events-none fixed flex flex-col gap-1.5 rounded-xl bg-dialog px-3 py-2 duration-200 animate-in fade-in-0 motion-reduce:animate-none",
          z,
        )}
        style={{ top: place.top, left: place.left, width: WHISPER.w }}
      >
        <LessonBeatChrome position={position} total={total} onExit={onExit} />
        {whisper && (
          <p
            role="status"
            className="text-sm leading-snug text-balance text-ink"
          >
            {whisper}
          </p>
        )}
      </div>
    </>
  );
}

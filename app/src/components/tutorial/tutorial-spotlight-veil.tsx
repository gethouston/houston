import { cn } from "@houston-ai/core";
import { MousePointerClick } from "lucide-react";
import {
  blockerPanels,
  type Rect,
  type Viewport,
} from "./tutorial-spotlight-geometry";

/**
 * Everything a spotlight paints AROUND its target: the transparent panels that
 * swallow clicks outside the hole, the dark veil cut open over it, and the cues
 * that say "here, CLICK". Not a word of copy and no interaction of its own, so
 * it lives apart from {@link import("./tutorial-spotlight")}, which is left to
 * compose this with the coach card.
 */
export function TutorialSpotlightVeil(props: {
  hole: Rect | null;
  dialogRect: Rect | null;
  viewport: Viewport;
  inDialog: boolean;
  /** The click cues. Off for watch-only beats, where nothing is clicked. */
  showCues: boolean;
  /** The band the whole step rides in, resolved by the caller. */
  z: string;
  /** Fade the dark parts in on mount instead of cutting to them. The lesson
   *  beat (`academy/lessons/lesson-spotlight.tsx`) turns this on so the
   *  dimming enters at the same pace as the whisper beside it; the guided
   *  setup cuts straight to its veil. The cues keep their own looping
   *  animations either way. */
  fadeIn?: boolean;
}) {
  const { hole, dialogRect, inDialog, showCues, z } = props;
  // Applied to the veil elements themselves (each already `fixed` with inline
  // coordinates), never to a wrapper: an ancestor mid-animation would become
  // the containing block for every fixed child and move the hole off target.
  const enter = props.fadeIn
    ? "duration-200 animate-in fade-in-0 motion-reduce:animate-none"
    : null;
  return (
    <>
      {!inDialog &&
        blockerPanels(hole, props.viewport).map((p, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 4-panel geometry, no reordering
            key={i}
            aria-hidden
            className="pointer-events-auto fixed z-40"
            style={p}
          />
        ))}
      {/* The visual veil: the tour's cutout (ring + giant shadow), or a plain
          full scrim while the target is off screen. Never intercepts clicks —
          the hole must stay truly open. In-dialog steps cut around the WHOLE
          modal instead (rendered above the dialog layer), so the step reads
          exactly like every other one: dark world, lit surface. */}
      {inDialog ? (
        dialogRect && (
          <div
            aria-hidden
            className={cn(
              "ht-tutorial-veil-cutout pointer-events-none fixed z-[60] rounded-2xl transition-[top,left,width,height] duration-200",
              enter,
            )}
            style={dialogRect}
          />
        )
      ) : hole ? (
        <div
          aria-hidden
          className={cn(
            "ht-tutorial-veil-cutout pointer-events-none fixed z-40 rounded-xl ring-2 ring-white/70 transition-[top,left,width,height] duration-200",
            enter,
          )}
          style={hole}
        />
      ) : (
        <div
          aria-hidden
          className={cn(
            "ht-tutorial-scrim pointer-events-none fixed inset-0 z-40",
            enter,
          )}
        />
      )}
      {/* In-dialog, the steady ring marks the inner target (the veil above
          rings nothing — it cuts around the modal). */}
      {inDialog && hole && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none fixed z-[60] rounded-xl ring-2 ring-white/70 transition-[top,left,width,height] duration-200",
            enter,
          )}
          style={hole}
        />
      )}
      {/* The click cues: a sonar ping radiating off the ring, and a cursor
          glyph tapping at the corner — "here, CLICK". Pure decoration. */}
      {hole && showCues && (
        <>
          <div
            aria-hidden
            className={cn(
              "ht-tutorial-ping pointer-events-none fixed rounded-xl ring-2 ring-white/70",
              z,
            )}
            style={hole}
          />
          <MousePointerClick
            aria-hidden
            className={cn(
              "ht-tutorial-cursor ht-tutorial-cursor-shadow pointer-events-none fixed h-6 w-6 text-white",
              z,
            )}
            style={{
              top: hole.top + hole.height - 10,
              left: hole.left + hole.width - 10,
            }}
          />
        </>
      )}
    </>
  );
}

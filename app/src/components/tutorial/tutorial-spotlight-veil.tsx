import { cn } from "@houston-ai/core";
import { MousePointerClick } from "lucide-react";
import {
  blockerPanels,
  type Rect,
  type Viewport,
} from "./tutorial-spotlight-geometry";

export function TutorialSpotlightVeil(props: {
  hole: Rect | null;
  dialogRect: Rect | null;
  viewport: Viewport;
  inDialog: boolean;
  showCues: boolean;
  z: string;
  fadeIn?: boolean;
}) {
  const { hole, dialogRect, inDialog, showCues, z } = props;
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

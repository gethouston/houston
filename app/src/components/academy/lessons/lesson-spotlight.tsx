import { Button, cn } from "@houston-ai/core";
import {
  type CardSize,
  placeCard,
  TutorialSpotlightVeil,
  useSpotlightRects,
} from "../../tutorial";
import { LessonBeatChrome } from "./lesson-beat-chrome";

const WHISPER: CardSize = { w: 260, h: 96 };
const WHISPER_WITH_ACTION: CardSize = { w: 260, h: 136 };

export function LessonSpotlight({
  selector,
  whisper,
  armed,
  inDialog,
  action,
  position,
  total,
  onExit,
}: {
  selector: string;
  whisper?: string;
  armed: boolean;
  inDialog?: boolean;
  action?: { label: string; onClick: () => void };
  position: number;
  total: number;
  onExit: () => void;
}) {
  const {
    hole: measured,
    dialogRect,
    viewport,
  } = useSpotlightRects(selector, inDialog);
  const hole = armed ? measured : null;
  const size = action ? WHISPER_WITH_ACTION : WHISPER;
  const place = placeCard({
    hole,
    dialogRect,
    viewport,
    inDialog: inDialog === true,
    size,
  });

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
      <div
        className={cn(
          "ht-shadow-modal pointer-events-none fixed flex flex-col gap-1.5 rounded-xl bg-dialog px-3 py-2 duration-200 animate-in fade-in-0 motion-reduce:animate-none",
          z,
        )}
        style={{ top: place.top, left: place.left, width: size.w }}
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
        {action && (
          <Button
            autoFocus
            size="sm"
            className="pointer-events-auto mt-1 self-end rounded-full active:scale-[0.96]"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        )}
      </div>
    </>
  );
}

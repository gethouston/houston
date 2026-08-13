import { Button } from "@houston-ai/core";
import { Clapperboard } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type AcademyVideo,
  formatVideoDuration,
} from "../../lib/academy/videos";

/** What the media area is doing. `failed` is where a broken source lands. */
type MediaState = "idle" | "playing" | "ended" | "failed";

/**
 * A lesson's opening beat: a short concept video, what it is about, and the one
 * way onward.
 *
 * The CONTENTS of a docked beat, not the surface it stands on — the panel, its
 * scrim and its label come from the caller
 * (`academy/lessons/lesson-docked-panel.tsx`), which the narration beat stands
 * on too, so the two read as one calm surface changing its contents. Structure:
 * the media block, then a single row with the words on the left and the one
 * action on the right. No corner close and no crown: the panel wears the beat's
 * count and its way out, so both docked beats carry them in the same place.
 *
 * Watching is never a gate. Continue is enabled from the first frame; finishing
 * the video only promotes the button from outline to filled, so the card
 * suggests the natural order without ever holding someone hostage to a play
 * head. A missing source (nothing published yet) or a media error both settle
 * into the same calm placeholder, never a broken player.
 *
 * Content-agnostic like the rest of the tutorial family: every string arrives as
 * a prop, already translated by the caller.
 */
export function LessonVideoCard(props: {
  video: AcademyVideo;
  /** The small word above the title that says what this beat IS. */
  kicker?: string;
  title: string;
  body?: string;
  continueLabel: string;
  comingSoonLabel: string;
  onContinue: () => void;
}) {
  const [state, setState] = useState<MediaState>("idle");
  // The documented React way to reset state on a prop change: no effect, no
  // stale "ended" CTA carried into the next lesson if the card is reused.
  const [shownId, setShownId] = useState(props.video.id);
  if (shownId !== props.video.id) {
    setShownId(props.video.id);
    setState("idle");
  }

  const playable = props.video.src !== null && state !== "failed";
  // Nothing to watch, or already watched: the CTA is simply the next step.
  const emphasized = !playable || state === "ended";

  // A player that FAILED takes the focus down with it: the <video> holding it
  // is unmounted for the placeholder, and the browser drops focus to <body> —
  // outside the beat, on an app the panel is standing over. Continue is where
  // the beat continues to be, so focus goes there. Only on the failure: the
  // idle placeholder never had the focus to lose (`autoFocus` above put it on
  // Continue at mount), and stealing it later would fight the user.
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (state === "failed") continueRef.current?.focus();
  }, [state]);

  return (
    <>
      {/* The media keeps 16:9 at every size, so it never letterboxes on its own
          plate. Height is governed by capping the WIDTH: the reserve is
          everything else the panel stands on (the count-and-close row, the
          words row, the padding), so on a short window the video shrinks with
          the viewport instead of pushing the Continue button off screen. The
          floor keeps it a video rather than a stamp; below that the panel
          scrolls as the last resort. */}
      <div className="relative mx-auto aspect-video w-[min(100%,max(12rem,(100dvh_-_19rem)*16/9))] shrink-0 overflow-hidden rounded-xl bg-chip">
        {playable ? (
          <LessonVideo
            video={props.video}
            onPlaying={() => setState("playing")}
            onEnded={() => setState("ended")}
            onFailed={() => setState("failed")}
          />
        ) : (
          <MediaPlaceholder label={props.comingSoonLabel} />
        )}
        {playable &&
          state === "idle" &&
          props.video.durationSeconds !== null && (
            // Top-right, clear of the native controls, and gone the moment the
            // video starts — it answers "how long is this?", nothing else.
            // Solid, because it reads over a poster frame of any brightness.
            <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-chip-solid px-2 py-0.5 text-xs text-chip-text tabular-nums">
              {formatVideoDuration(props.video.durationSeconds)}
            </span>
          )}
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          {props.kicker && (
            <p className="text-xs text-ink-muted">{props.kicker}</p>
          )}
          <h2 className="mt-0.5 text-base font-medium text-balance text-ink">
            {props.title}
          </h2>
          {props.body && (
            <p className="mt-1 text-sm text-balance text-ink-muted">
              {props.body}
            </p>
          )}
        </div>
        <Button
          ref={continueRef}
          // Focus goes to the video when there is one, so a keyboard user's
          // first key press plays the lesson instead of skipping past it; with
          // nothing to watch, this button is where the beat starts. Either way
          // focus lands INSIDE the beat, never back on the app behind it.
          autoFocus={!playable}
          variant={emphasized ? "default" : "outline"}
          className="shrink-0 rounded-full active:scale-[0.96]"
          onClick={props.onContinue}
        >
          {props.continueLabel}
        </Button>
      </div>
    </>
  );
}

/** The player itself. Native controls: the platform's are the ones people know. */
function LessonVideo(props: {
  video: AcademyVideo;
  onPlaying: () => void;
  onEnded: () => void;
  onFailed: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // The beat opens with focus on the player: Space plays it, and a keyboard
  // user is never left with focus on the app the panel is standing over.
  // Done by hand rather than with `autoFocus`, which React only honours on the
  // form controls it treats as focusable.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    // Caption tracks ship with the recordings themselves. An empty <track>
    // would advertise captions that do not exist, which serves a deaf viewer
    // worse than the honest absence.
    // biome-ignore lint/a11y/useMediaCaption: captions arrive with the assets
    <video
      ref={ref}
      key={props.video.src}
      src={props.video.src ?? undefined}
      poster={props.video.posterSrc ?? undefined}
      controls
      // Enough to draw the first frame and the timeline without spending a
      // user's bandwidth on a video they may not play.
      preload="metadata"
      // Absolutely filling its 16:9 plate, so neither the frame's intrinsic
      // size nor the poster's can ever stretch the box or spill out of it;
      // `object-contain` keeps whatever ratio the recording actually has.
      className="absolute inset-0 h-full w-full object-contain"
      onPlay={props.onPlaying}
      onEnded={props.onEnded}
      onError={props.onFailed}
    />
  );
}

/** Where an unpublished lesson and a broken source both land. */
function MediaPlaceholder(props: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6">
      <Clapperboard className="h-6 w-6 text-ink-muted" aria-hidden />
      <p className="text-sm text-balance text-ink-muted">{props.label}</p>
    </div>
  );
}

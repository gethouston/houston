import { Button } from "@houston-ai/core";
import { Clapperboard } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type AcademyVideo,
  formatVideoDuration,
} from "../../lib/academy/videos";

type MediaState = "idle" | "playing" | "ended" | "failed";

export function LessonVideoCard(props: {
  video: AcademyVideo;
  kicker?: string;
  title: string;
  body?: string;
  continueLabel: string;
  comingSoonLabel: string;
  onContinue: () => void;
}) {
  const [state, setState] = useState<MediaState>("idle");
  const [shownId, setShownId] = useState(props.video.id);
  if (shownId !== props.video.id) {
    setShownId(props.video.id);
    setState("idle");
  }

  const playable = props.video.src !== null && state !== "failed";
  const emphasized = !playable || state === "ended";

  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (state === "failed") continueRef.current?.focus();
  }, [state]);

  return (
    <>
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

function LessonVideo(props: {
  video: AcademyVideo;
  onPlaying: () => void;
  onEnded: () => void;
  onFailed: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    // biome-ignore lint/a11y/useMediaCaption: captions arrive with the assets
    <video
      ref={ref}
      key={props.video.src}
      src={props.video.src ?? undefined}
      poster={props.video.posterSrc ?? undefined}
      controls
      preload="metadata"
      className="absolute inset-0 h-full w-full object-contain"
      onPlay={props.onPlaying}
      onEnded={props.onEnded}
      onError={props.onFailed}
    />
  );
}

function MediaPlaceholder(props: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6">
      <Clapperboard className="h-6 w-6 text-ink-muted" aria-hidden />
      <p className="text-sm text-balance text-ink-muted">{props.label}</p>
    </div>
  );
}

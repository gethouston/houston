"use client";

import { type PointerEvent, useEffect, useId, useRef } from "react";
import {
  type BrowserLiveStageGeometry,
  wheelInput,
} from "./browser-live-geometry";
import { useBrowserLiveKeyboard } from "./browser-live-keyboard";
import type { BrowserLiveViewLabels } from "./browser-live-labels";
import { BrowserLiveOverlay } from "./browser-live-overlay";
import { useBrowserLivePaint } from "./browser-live-paint";
import {
  type BrowserLivePointerSample,
  createBrowserLivePointer,
} from "./browser-live-pointer";
import { BrowserLiveSkeleton } from "./browser-live-skeleton";
import type {
  BrowserLiveFrames,
  BrowserLiveViewInput,
  BrowserLiveViewState,
} from "./browser-live-types";

export interface BrowserLiveStageProps {
  state: BrowserLiveViewState;
  frames: BrowserLiveFrames;
  onInput: (events: BrowserLiveViewInput[]) => void;
  onRetry: () => void;
  onPaintError?: (error: unknown) => void;
  onLeavePage?: () => void;
  labels: BrowserLiveViewLabels;
}

function geometryOf(canvas: HTMLCanvasElement): BrowserLiveStageGeometry {
  const rect = canvas.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    frameWidth: canvas.width,
  };
}

function sampleOf(e: PointerEvent): BrowserLivePointerSample {
  return {
    pointerType: e.pointerType,
    button: e.button,
    buttons: e.buttons,
    clientX: e.clientX,
    clientY: e.clientY,
  };
}

export function BrowserLiveStage({
  state,
  frames,
  onInput,
  onRetry,
  onPaintError,
  onLeavePage,
  labels,
}: BrowserLiveStageProps) {
  const hintId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const pointer = useRef(createBrowserLivePointer()).current;
  const painted = useBrowserLivePaint(canvasRef, frames, onPaintError);
  const live = state === "live";
  const send = (event: BrowserLiveViewInput) => onInput([event]);
  useBrowserLiveKeyboard(fieldRef, send, live, onLeavePage);

  const onInputRef = useRef(onInput);
  useEffect(() => {
    onInputRef.current = onInput;
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !live) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      onInputRef.current([wheelInput(e, geometryOf(canvas))]);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [live]);

  const handle = (events: BrowserLiveViewInput[]) => {
    if (events.length > 0) onInput(events);
  };
  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!live) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    handle(pointer.down(sampleOf(e), geometryOf(e.currentTarget), e.timeStamp));
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!live) return;
    handle(pointer.move(sampleOf(e), geometryOf(e.currentTarget), e.timeStamp));
  };
  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!live) return;
    const up = pointer.up(sampleOf(e), geometryOf(e.currentTarget));
    handle(up.events);
    if (up.focusKeyboard) fieldRef.current?.focus({ preventScroll: true });
  };

  const loading =
    !painted && (live || state === "connecting" || state === "reconnecting");
  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden bg-chip-subtle"
      data-browser-live-stage=""
    >
      {loading ? (
        <div className="absolute inset-0 flex justify-center p-2 md:p-6">
          <BrowserLiveSkeleton />
        </div>
      ) : null}
      <div className="absolute inset-0 flex items-start justify-center p-2 md:items-center">
        <canvas
          aria-label={labels.website}
          className={`max-h-full max-w-full touch-none rounded-md bg-background shadow-edge outline-none transition-opacity duration-200 ease-out ${painted ? (live ? "opacity-100" : "opacity-60") : "invisible opacity-0"}`}
          data-testid="browser-live-canvas"
          height={0}
          onContextMenu={(e) => e.preventDefault()}
          onPointerCancel={() => pointer.cancel()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          ref={canvasRef}
          width={0}
        />
      </div>
      <BrowserLiveOverlay labels={labels} onRetry={onRetry} state={state} />
      <span className="sr-only" id={hintId}>
        {labels.leavePage}
      </span>
      <textarea
        aria-describedby={hintId}
        aria-label={labels.tapToType}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="pointer-events-none absolute bottom-0 left-0 size-px resize-none border-0 p-0 text-base opacity-0"
        data-testid="browser-live-keyboard"
        ref={fieldRef}
        spellCheck={false}
        tabIndex={-1}
      />
    </div>
  );
}

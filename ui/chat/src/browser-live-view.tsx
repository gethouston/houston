"use client";

import { Button } from "@houston-ai/core";
import { ArrowLeftIcon, LockIcon, XIcon } from "lucide-react";
import { useRef } from "react";
import { BrowserLiveAddress } from "./browser-live-address";
import {
  type BrowserLiveViewLabels,
  DEFAULT_BROWSER_LIVE_VIEW_LABELS,
} from "./browser-live-labels";
import { BrowserLiveStage } from "./browser-live-stage";
import { BrowserLiveTask } from "./browser-live-task";
import { BrowserLiveTimeLeft, useMinutesLeft } from "./browser-live-time-left";
import {
  type BrowserLiveFrames,
  type BrowserLiveViewInput,
  type BrowserLiveViewState,
  isBrowserLiveViewEnded,
} from "./browser-live-types";

export interface BrowserLiveViewProps {
  state: BrowserLiveViewState;
  task: string;
  url: string;
  title: string;
  frames: BrowserLiveFrames;
  expiresAt: number;
  onInput: (events: BrowserLiveViewInput[]) => void;
  onDone: () => void;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
  onPaintError?: (error: unknown) => void;
  addressRefused?: boolean;
  labels?: Partial<BrowserLiveViewLabels>;
}

const PRESS = "active:scale-[0.97]";

export function BrowserLiveView({
  state,
  task,
  url,
  title,
  frames,
  expiresAt,
  onInput,
  onDone,
  onCancel,
  onClose,
  onRetry,
  onPaintError,
  addressRefused = false,
  labels: labelOverrides,
}: BrowserLiveViewProps) {
  const labels = { ...DEFAULT_BROWSER_LIVE_VIEW_LABELS, ...labelOverrides };
  const ended = isBrowserLiveViewEnded(state);
  const live = state === "live";
  const minutes = useMinutesLeft(expiresAt, !ended);
  const send = (event: BrowserLiveViewInput) => onInput([event]);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const leavePage = () =>
    toolbarRef.current
      ?.querySelector<HTMLElement>("button:enabled, input:enabled")
      ?.focus();

  return (
    <div className="flex h-full min-h-0 flex-col bg-dialog">
      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <BrowserLiveTask
            showLess={labels.showLess}
            showMore={labels.showMore}
            task={task}
          />
          <p className="flex items-start gap-1.5 text-xs text-ink-muted">
            <LockIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {labels.privacy}
          </p>
        </div>
        <button
          aria-label={labels.close}
          className={`relative -mr-1 shrink-0 rounded-lg p-1.5 text-ink-muted outline-none transition-transform duration-150 ease-out after:absolute after:-inset-2 hover:bg-hover hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/50 ${PRESS}`}
          onClick={onClose}
          type="button"
        >
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      </header>
      <div
        className="flex items-start gap-2 border-b border-line px-3 py-2"
        ref={toolbarRef}
      >
        <Button
          className={`h-10 shrink-0 ${PRESS}`}
          disabled={!live}
          onClick={() => send({ type: "back" })}
          variant="ghost"
        >
          <ArrowLeftIcon aria-hidden="true" />
          <span className="sr-only md:not-sr-only">{labels.back}</span>
        </Button>
        <BrowserLiveAddress
          disabled={!live}
          label={labels.address}
          onNavigate={(target) => send({ type: "navigate", url: target })}
          refused={addressRefused}
          refusedLabel={labels.addressRefused}
          url={url}
        />
      </div>
      <BrowserLiveStage
        frames={frames}
        labels={{ ...labels, website: title || labels.website }}
        onInput={onInput}
        onLeavePage={leavePage}
        onPaintError={onPaintError}
        onRetry={onRetry}
        state={state}
      />
      <footer className="border-t border-line pb-safe md:pb-0">
        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-4">
          {live || minutes !== null ? (
            <div className="flex min-h-7 items-center justify-between gap-3 md:flex-1 md:justify-start">
              {live ? (
                <p className="text-xs text-ink-muted">{labels.tapToType}</p>
              ) : (
                <span />
              )}
              {minutes !== null ? (
                <BrowserLiveTimeLeft
                  label={labels.timeLeft}
                  lastMinuteLabel={labels.timeLeftLastMinute}
                  minutes={minutes}
                />
              ) : null}
            </div>
          ) : null}
          <div className="flex gap-2 md:ml-auto">
            {ended ? (
              <Button
                className={`min-h-11 flex-1 md:min-h-9 md:flex-none ${PRESS}`}
                onClick={onClose}
                variant="outline"
              >
                {labels.close}
              </Button>
            ) : (
              <>
                <Button
                  className={`min-h-11 px-5 md:min-h-9 md:px-4 ${PRESS}`}
                  onClick={onCancel}
                  variant="ghost"
                >
                  {labels.cancel}
                </Button>
                <Button
                  className={`min-h-11 flex-1 md:min-h-9 md:flex-none ${PRESS}`}
                  disabled={state === "connecting"}
                  onClick={onDone}
                >
                  {labels.finish}
                </Button>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

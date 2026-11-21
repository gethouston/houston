"use client";

import { Button, Spinner } from "@houston-ai/core";
import type { BrowserLiveViewLabels } from "./browser-live-labels";
import type { BrowserLiveViewState } from "./browser-live-types";

function endedMessage(
  state: BrowserLiveViewState,
  labels: BrowserLiveViewLabels,
): string | null {
  switch (state) {
    case "done":
      return labels.endedDone;
    case "cancelled":
      return labels.endedCancelled;
    case "expired":
      return labels.endedExpired;
    case "none":
      return labels.endedNone;
    case "not_owner":
      return labels.notOwner;
    default:
      return null;
  }
}

export interface BrowserLiveOverlayProps {
  state: BrowserLiveViewState;
  labels: BrowserLiveViewLabels;
  onRetry: () => void;
}

export function BrowserLiveOverlay({
  state,
  labels,
  onRetry,
}: BrowserLiveOverlayProps) {
  const ended = endedMessage(state, labels);
  const busy = state === "connecting" || state === "reconnecting";
  return (
    <>
      {busy ? (
        <div className="absolute inset-x-0 top-4 flex justify-center">
          <span
            className="browser-handoff-swap-in inline-flex items-center gap-2 rounded-full bg-dialog px-3 py-1.5 text-sm text-ink shadow-card"
            key={state}
            role="status"
          >
            <Spinner aria-hidden="true" role="presentation" />
            {state === "connecting" ? labels.connecting : labels.reconnecting}
          </span>
        </div>
      ) : null}
      {state === "lost" || ended ? (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div
            className="browser-handoff-swap-in flex max-w-sm flex-col items-center gap-3 rounded-xl bg-dialog p-4 text-center shadow-card"
            role="status"
          >
            <p className="text-sm text-ink">{ended ?? labels.lost}</p>
            {state === "lost" ? (
              <Button
                className="min-h-11 active:scale-[0.97] md:min-h-9"
                onClick={onRetry}
                variant="outline"
              >
                {labels.retry}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

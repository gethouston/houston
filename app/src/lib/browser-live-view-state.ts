import type { BrowserLiveConnectionState } from "@houston/engine-adapter";
import type {
  BrowserLiveFrames,
  BrowserLiveViewFrame,
  BrowserLiveViewState,
} from "@houston-ai/chat";

export function browserLiveViewState(
  connection: BrowserLiveConnectionState,
): BrowserLiveViewState {
  return connection.kind === "ended" ? connection.reason : connection.kind;
}

export interface BrowserLiveFrameEmitter extends BrowserLiveFrames {
  push(frame: BrowserLiveViewFrame): void;
}

export function createBrowserLiveFrames(): BrowserLiveFrameEmitter {
  const listeners = new Set<(frame: BrowserLiveViewFrame) => void>();
  let latest: BrowserLiveViewFrame | null = null;
  return {
    push(frame) {
      latest = frame;
      for (const listener of listeners) listener(frame);
    },
    latest: () => latest,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

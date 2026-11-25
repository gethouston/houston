import type {
  BrowserLiveFrames,
  BrowserLiveViewFrame,
  BrowserLiveViewState,
} from "@houston-ai/chat";
import type { BrowserLiveConnectionState } from "@houston/engine-adapter";

/** The live view's state for the SDK connection's state. */
export function browserLiveViewState(
  connection: BrowserLiveConnectionState,
): BrowserLiveViewState {
  return connection.kind === "ended" ? connection.reason : connection.kind;
}

export interface BrowserLiveFrameEmitter extends BrowserLiveFrames {
  push(frame: BrowserLiveViewFrame): void;
}

/** Frames as the view wants them: outside React state, latest kept for a
 *  stage that mounts after the first frame arrived. */
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

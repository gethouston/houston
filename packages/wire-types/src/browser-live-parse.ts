import {
  BROWSER_HANDOFF_FAILURES,
  type BrowserHandoffFailure,
  type BrowserLiveEvent,
  type BrowserLiveInputAnswer,
  type BrowserLiveWindow,
} from "./browser-live";
import {
  count,
  finite,
  handoffId,
  isState,
  record,
  text,
} from "./browser-live-fields";

export { parseBrowserLiveInputRequest } from "./browser-live-input-parse";

export function parseBrowserLiveEvent(value: unknown): BrowserLiveEvent {
  const body = record(value, "browser live event");
  switch (body.type) {
    case "frame": {
      const width = finite(body.width, "browser live frame width");
      const height = finite(body.height, "browser live frame height");
      if (width <= 0 || height <= 0)
        throw new Error("Invalid browser live frame size");
      const jpeg = text(body.jpeg, "browser live frame jpeg");
      if (!jpeg) throw new Error("Invalid browser live frame jpeg");
      return {
        type: "frame",
        seq: count(body.seq, "browser live frame seq"),
        jpeg,
        width,
        height,
      };
    }
    case "page":
      return {
        type: "page",
        url: text(body.url, "browser live page url"),
        title: text(body.title, "browser live page title"),
      };
    case "status":
      if (!isState(body.state))
        throw new Error("Invalid browser live status state");
      return {
        type: "status",
        handoffId: handoffId(body.handoffId, "browser live status handoffId"),
        state: body.state,
        text: text(body.text, "browser live status text"),
        expiresAt: count(body.expiresAt, "browser live status expiresAt"),
        ...(body.window === undefined
          ? {}
          : { window: liveWindow(body.window) }),
      };
    default:
      throw new Error("Invalid browser live event type");
  }
}

function liveWindow(value: unknown): BrowserLiveWindow {
  const body = record(value, "browser live status window");
  const frames = count(body.frames, "browser live window frames");
  const bytes = count(body.bytes, "browser live window bytes");
  if (frames < 1 || bytes < 1) throw new Error("Invalid browser live window");
  return { frames, bytes };
}

export function parseBrowserLiveInputAnswer(
  value: unknown,
): BrowserLiveInputAnswer {
  const body = record(value, "browser input answer");
  if (!isState(body.state))
    throw new Error("Invalid browser input answer state");
  if (body.refused !== undefined && body.refused !== "url_refused")
    throw new Error("Invalid browser input answer refusal");
  return {
    state: body.state,
    ...(body.refused === "url_refused" ? { refused: body.refused } : {}),
  };
}

const FAILURE_PATTERN = /\bERROR (handoff_[a-z]+):/;

export function browserHandoffFailureOf(
  content: string,
): BrowserHandoffFailure | null {
  const code = content.slice(0, 200).match(FAILURE_PATTERN)?.[1];
  return BROWSER_HANDOFF_FAILURES.includes(code as BrowserHandoffFailure)
    ? (code as BrowserHandoffFailure)
    : null;
}

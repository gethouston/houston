/** The input POST body parser (`BrowserLiveInputRequest`). */

import {
  BROWSER_LIVE_KEYS,
  BROWSER_LIVE_MAX_EVENTS,
  BROWSER_LIVE_MAX_TEXT,
  BROWSER_LIVE_VIEWER,
  type BrowserLiveInput,
  type BrowserLiveInputRequest,
  type BrowserLiveKey,
  type BrowserLiveMouseAction,
} from "./browser-live";
import {
  type Body,
  count,
  finite,
  handoffId,
  record,
  text,
  unit,
} from "./browser-live-fields";

const MOUSE_ACTIONS: ReadonlySet<BrowserLiveMouseAction> = new Set([
  "move",
  "down",
  "up",
  "click",
]);
/** All four CDP modifier bits set. */
const MODIFIER_MASK = 15;

function parseMouse(body: Body): BrowserLiveInput {
  const action = body.action as BrowserLiveMouseAction;
  if (!MOUSE_ACTIONS.has(action))
    throw new Error("Invalid browser input mouse action");
  const { buttons, clickCount } = body;
  if (buttons !== undefined && buttons !== 0 && buttons !== 1)
    throw new Error("Invalid browser input mouse buttons");
  if (
    clickCount !== undefined &&
    clickCount !== 1 &&
    clickCount !== 2 &&
    clickCount !== 3
  )
    throw new Error("Invalid browser input mouse clickCount");
  return {
    type: "mouse",
    action,
    x: unit(body.x, "browser input mouse x"),
    y: unit(body.y, "browser input mouse y"),
    ...(buttons === undefined ? {} : { buttons }),
    ...(clickCount === undefined ? {} : { clickCount }),
  };
}

function parseInput(value: unknown): BrowserLiveInput {
  const body = record(value, "browser input event");
  switch (body.type) {
    case "mouse":
      return parseMouse(body);
    case "wheel":
      return {
        type: "wheel",
        x: unit(body.x, "browser input wheel x"),
        y: unit(body.y, "browser input wheel y"),
        dx: finite(body.dx, "browser input wheel dx"),
        dy: finite(body.dy, "browser input wheel dy"),
      };
    case "key": {
      if (!BROWSER_LIVE_KEYS.includes(body.key as BrowserLiveKey))
        throw new Error("Invalid browser input key");
      const key = body.key as BrowserLiveKey;
      if (body.modifiers === undefined) return { type: "key", key };
      const modifiers = count(body.modifiers, "browser input key modifiers");
      if (modifiers > MODIFIER_MASK)
        throw new Error("Invalid browser input key modifiers");
      return { type: "key", key, modifiers };
    }
    case "text": {
      const value = text(body.text, "browser input text");
      if (!value || value.length > BROWSER_LIVE_MAX_TEXT)
        throw new Error("Invalid browser input text length");
      return { type: "text", text: value };
    }
    case "navigate": {
      const url = text(body.url, "browser input url").trim();
      if (!url || url.length > BROWSER_LIVE_MAX_TEXT)
        throw new Error("Invalid browser input url");
      return { type: "navigate", url };
    }
    case "back":
      return { type: "back" };
    default:
      throw new Error("Invalid browser input event type");
  }
}

/** The input POST body, or a throw (the runtime answers `400 invalid_input`). */
export function parseBrowserLiveInputRequest(
  value: unknown,
): BrowserLiveInputRequest {
  const body = record(value, "browser input request");
  const request: BrowserLiveInputRequest = {};
  if (body.handoff !== undefined)
    request.handoff = handoffId(body.handoff, "browser input handoff");
  if (body.events !== undefined) {
    if (!Array.isArray(body.events))
      throw new Error("Invalid browser input events");
    if (body.events.length > BROWSER_LIVE_MAX_EVENTS)
      throw new Error("Too many browser input events");
    request.events = body.events.map(parseInput);
  }
  if (body.ack !== undefined) {
    const ack = record(body.ack, "browser input ack");
    const viewer = text(ack.viewer, "browser input ack viewer");
    if (!BROWSER_LIVE_VIEWER.test(viewer))
      throw new Error("Invalid browser input ack viewer");
    request.ack = { viewer, seq: count(ack.seq, "browser input ack seq") };
  }
  if (body.batch !== undefined) {
    const batch = record(body.batch, "browser input batch");
    const viewer = text(batch.viewer, "browser input batch viewer");
    if (!BROWSER_LIVE_VIEWER.test(viewer))
      throw new Error("Invalid browser input batch viewer");
    const seq = count(batch.seq, "browser input batch seq");
    if (seq < 1 || !Number.isSafeInteger(seq))
      throw new Error("Invalid browser input batch seq");
    request.batch = { viewer, seq };
  }
  if (body.finish !== undefined) {
    if (body.finish !== "done" && body.finish !== "cancel")
      throw new Error("Invalid browser input finish");
    request.finish = body.finish;
  }
  // Anything that acts names its hand-off: unattributed, a late Done or batch
  // from an earlier hand-off's view would land on the chat's next one.
  const acts = request.events || request.ack || request.finish;
  if (acts && request.handoff === undefined)
    throw new Error("Invalid browser input without handoff");
  return request;
}

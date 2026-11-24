import {
  type BrowserLiveEvent,
  type BrowserLiveInputAnswer,
  type BrowserLiveInputRequest,
  type BrowserLiveLayout,
  parseBrowserLiveInputAnswer,
} from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { isTransportFailure } from "../../transport-failure";
import { randomNonce } from "../turns/random-nonce";
import { openBrowserLiveConnection } from "./connection";
import { readLiveEvent } from "./live-event";
import type {
  BrowserLiveConnection,
  BrowserLiveConnectOptions,
  BrowserLiveHandlers,
} from "./types";

export interface BrowserWatchOptions {
  signal: AbortSignal;
  onEvent: (event: BrowserLiveEvent) => void;
  onActivity?: () => void;
  /** A known message type with a broken shape; skipped. Absent: it rejects. */
  onMalformed?: (error: unknown) => void;
}

export function createBrowserModule(ctx: ModuleContext) {
  /**
   * Streams the live picture of a website the agent handed to the person.
   *
   * One connection attempt as viewer `viewer`, on hand-off `handoff` once a
   * status named it (a reconnect of an earlier hand-off's view then gets that
   * hand-off's end, never a newer one): resolves when the stream ends,
   * rejects with the engine error (`404` no hand-off, `403` someone else's,
   * `409` the named hand-off is over) or
   * on a malformed message (unless `onMalformed` takes it). A message type
   * this client does not know is skipped. {@link connect} is the reconnecting
   * binding.
   * @assistant group:chat
   * @assistant hidden: it streams a live picture of a website into the person's own screen while they sign in; dispatched on its own it would stream into nothing.
   */
  const watch = async (
    conversationId: string,
    agentId: string,
    viewer: string,
    layout: BrowserLiveLayout,
    handoff: string | undefined,
    options: BrowserWatchOptions,
  ): Promise<void> => {
    await ctx
      .clientFor(agentId)
      .streamBrowserLive(conversationId, viewer, layout, handoff, {
        signal: options.signal,
        onFrame: (raw) => {
          const event = readLiveEvent(raw, options.onMalformed);
          if (event) options.onEvent(event);
        },
        onActivity: options.onActivity,
      });
  };

  /**
   * Sends the person's clicks, typing and frame acks to a handed-over website.
   *
   * One batch, applied in order; `finish` ends the hand-off and must name it
   * (`handoff`). Rejects with the engine error (`409` that hand-off already
   * ended, `404`, `403`, `400`).
   * @assistant group:chat
   * @assistant hidden: it types and clicks into a website in place of the person during a sign-in hand-off; only the person at the screen may drive it, and the AI Manager driving it would defeat the hand-off.
   */
  const input = async (
    conversationId: string,
    agentId: string,
    request: BrowserLiveInputRequest,
  ): Promise<BrowserLiveInputAnswer> =>
    parseBrowserLiveInputAnswer(
      await ctx.clientFor(agentId).browserInput(conversationId, request),
    );

  const connect = (
    conversationId: string,
    agentId: string,
    handlers: BrowserLiveHandlers,
    options: BrowserLiveConnectOptions = {},
  ): BrowserLiveConnection =>
    openBrowserLiveConnection({
      viewer: randomNonce(),
      layout: options.layout ?? "desktop",
      watch: ({ viewer, layout, handoff, ...rest }) =>
        watch(conversationId, agentId, viewer, layout, handoff, rest),
      input: (request) => input(conversationId, agentId, request),
      clock: ctx.config.ports.clock,
      isTransport: isTransportFailure,
      handlers,
    });

  return { watch, input, connect };
}

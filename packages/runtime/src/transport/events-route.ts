import {
  parseResumeCursor,
  serveResumableStream,
} from "@houston/runtime-client";
import { replayAfter, snapshot, subscribe } from "../session/bus";
import type { RouteContext } from "./http-helpers";
import { openSSE } from "./sse";

/**
 * GET /conversations/:id/events — the live, resumable conversation stream.
 *
 * Fresh connect (no cursor): a `sync` catch-up frame (running/partial/seq
 * watermark + the running turn's id), then live frames. Resume (`?after=<seq>`
 * or `Last-Event-ID`, query wins): the missed frames are replayed from the
 * bus's in-flight-turn buffer and live frames follow — no `sync`, no gap, no
 * duplicate. A cursor the buffer can't serve (too old / from before a restart)
 * gets a `sync` with `resync: true` instead; the client refetches history and
 * rebuilds.
 *
 * The connect/replay/flush choreography is the shared `serveResumableStream`
 * (@houston/runtime-client) — one implementation for this route and the host's
 * turn-relay twin.
 */
export function handleConversationEvents(ctx: RouteContext, id: string): void {
  const { req, res, url } = ctx;
  const after = parseResumeCursor(
    url.searchParams.get("after"),
    req.headers["last-event-id"],
  );
  const sse = openSSE(res);

  let closed = false;
  let unsubscribe: (() => void) | undefined;
  req.on("close", () => {
    closed = true;
    unsubscribe?.();
    sse.close();
  });

  serveResumableStream(
    {
      subscribe: (deliver) => subscribe(id, deliver),
      snapshot: () => snapshot(id),
      replayAfter: (cursor) => replayAfter(id, cursor),
    },
    after,
    sse.send,
  )
    .then((stop) => {
      // The client may have hung up while the stitch was in flight — release
      // the subscription instead of waiting for a 'close' that already fired.
      if (closed) stop();
      else unsubscribe = stop;
    })
    .catch((err: unknown) => {
      // A failed stitch must not leave the client on a silent, frameless
      // stream — close it so the resumable client reconnects and retries.
      console.error(`[events] stream setup failed for ${id}:`, err);
      sse.close();
    });
}

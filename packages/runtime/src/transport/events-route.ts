import {
  parseResumeCursor,
  serveResumableStream,
} from "@houston/runtime-client";
import { replayAfter, snapshot, subscribe } from "../session/bus";
import type { RouteContext } from "./http-helpers";
import { openSSE } from "./sse";

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
      if (closed) stop();
      else unsubscribe = stop;
    })
    .catch((err: unknown) => {
      console.error(`[events] stream setup failed for ${id}:`, err);
      sse.close();
    });
}

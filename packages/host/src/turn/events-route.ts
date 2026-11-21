import type { IncomingMessage, ServerResponse } from "node:http";
import {
  parseResumeCursor,
  serveResumableStream,
} from "@houston/runtime-client";
import { openSSE } from "../sse";
import type { TurnRelay } from "./relay";

export async function serveConversationEvents(
  relay: TurnRelay,
  agentId: string,
  key: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sse = openSSE(res);
  const after = parseResumeCursor(
    url.searchParams.get("after"),
    req.headers["last-event-id"],
  );

  let closed = false;
  let unsubscribe: (() => void) | undefined;
  req.on("close", () => {
    closed = true;
    unsubscribe?.();
    sse.close();
  });

  await relay.reapIfDead(agentId, key);
  const stop = await serveResumableStream(
    {
      subscribe: (deliver) => relay.subscribe(key, deliver),
      snapshot: () => relay.snapshot(key),
      replayAfter: (cursor) => relay.replayAfter(key, cursor),
    },
    after,
    sse.send,
  );
  if (closed) stop();
  else unsubscribe = stop;
}

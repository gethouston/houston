import type { IncomingMessage, ServerResponse } from "node:http";
import {
  parseResumeCursor,
  serveResumableStream,
} from "@houston/runtime-client";
import { openSSE } from "../sse";
import type { TurnRelay } from "./relay";

/**
 * GET /agents/:id/conversations/:cid/events on the cloudrun channel — the
 * host-served twin of the runtime's resumable conversation stream, same wire
 * contract (`packages/runtime/src/transport/events-route.ts`). The
 * connect/replay/flush choreography is the shared `serveResumableStream`
 * (@houston/runtime-client): fresh connect → `sync` then live frames; a
 * serviceable cursor → gap/dupe-free replay; anything else → `sync` with
 * `resync: true`.
 *
 * Before serving, the relay's dead-pump reaper runs: a conversation whose
 * snapshot says "running" while no replica holds the agent's turn lease lost
 * its pump (crashed replica) — the reaper terminates it with a synthesized
 * error frame, so this request is served against the healed state instead of
 * spinning until the snapshot's TTL.
 */
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

  // Registered BEFORE the async relay reads: a client that hangs up mid-read
  // must still release its subscription (set below) and the stream.
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
  // The client may have hung up while the reads were in flight — release the
  // subscription instead of waiting for a 'close' that already fired.
  if (closed) stop();
  else unsubscribe = stop;
}

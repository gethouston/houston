import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * A signal that fires when the client goes away before the response is sent —
 * the browser aborted its fetch (a superseded typed search), the tab closed,
 * the tunnel dropped. Routes that fan out to a slow upstream thread it into
 * that fetch so abandoned work is cancelled instead of running to its timeout
 * (PRODUCT-1728: three searches per keystroke burst, each holding the
 * skills.sh slot for the full 10 s).
 *
 * Node fires "close" on the ServerResponse, bun on the IncomingMessage; listen
 * on both so it works under either runtime (same pairing as proxy/route.ts).
 * "close" also follows a normally completed response, so the signal aborts
 * after every request — harmless, since nothing is pending by then. Callers
 * that catch a failure must check `signal.aborted` FIRST: a client that hung
 * up has no response to receive, and its abort reason is not a route error.
 */
export function clientAbortSignal(
  req: IncomingMessage,
  res: ServerResponse,
): AbortSignal {
  const controller = new AbortController();
  const onClose = () => controller.abort();
  res.once("close", onClose);
  req.once("close", onClose);
  return controller.signal;
}

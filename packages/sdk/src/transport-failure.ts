/**
 * The one predicate for "the connection failed before or while the answer
 * arrived": the browser engines' transport `TypeError`s, told apart from a
 * coding-bug `TypeError` ("undefined is not a function") by their small fixed
 * set of messages. A match does not prove the server never acted on the
 * request, so it must not justify replaying a non-idempotent one. The
 * engine adapter's offline classifier and the SDK's interrupted-upload typing
 * both read it, so the two can never disagree on what a network failure is.
 *
 * Dependency-free and erasable-syntax-only: the app's node:test entry points
 * load it through the `@houston/sdk/transport-failure` subpath.
 */

/**
 * The messages `fetch` transport rejections carry, per engine:
 *  - WebKit (our Tauri webview): "Load failed", sometimes suffixed with the
 *    host ("Load failed (gateway.gethouston.ai)"), plus the CFNetwork
 *    phrasings older WebKits surface ("The network connection was lost.",
 *    "The Internet connection appears to be offline.", "A server with the
 *    specified hostname could not be found.", "Could not connect to the
 *    server.", "The request timed out.").
 *  - Chromium: "Failed to fetch", and "network error" when the connection
 *    drops while the response body streams.
 *  - Firefox: "NetworkError when attempting to fetch resource.".
 *  - Node/undici (web dev, tests): "fetch failed".
 */
const TRANSPORT_MESSAGE =
  /^load failed|^failed to fetch|^network error$|^networkerror|^fetch failed|network connection was lost|internet connection appears to be offline|hostname could not be found|could not connect to the server|request timed out/i;

/**
 * Whether `err` is a `fetch` transport rejection, never a coding bug. The
 * connection failed before the answer arrived or while its body streamed, so
 * a match does not prove the server never acted on the request: it must not
 * justify replaying a non-idempotent one.
 */
export function isTransportFailure(err: unknown): err is TypeError {
  return err instanceof TypeError && TRANSPORT_MESSAGE.test(err.message);
}

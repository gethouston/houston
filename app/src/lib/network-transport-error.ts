// The "is this failure just connectivity?" classifier for the error-surfacing
// layer. Dependency-free so it is node-testable directly
// (app/tests/network-transport-error.test.ts) and importable from anywhere.
//
// Distinct from `isTransientEngineError` (the retry classifier): that one asks
// "worth another attempt?" and matches ANY TypeError. This one gates the
// bug-report surface (red toast + Sentry), so it must NEVER match a coding-bug
// TypeError ("undefined is not a function") — it keys on the small fixed set of
// messages browsers use for fetch transport failures.

/**
 * The messages `fetch` transport rejections carry, per engine:
 *  - WebKit (our Tauri webview): "Load failed", sometimes suffixed with the
 *    host — "Load failed (gateway.gethouston.ai)" — plus the CFNetwork
 *    phrasings older WebKits surface ("The network connection was lost.",
 *    "The Internet connection appears to be offline.", "A server with the
 *    specified hostname could not be found.", "Could not connect to the
 *    server.", "The request timed out.").
 *  - Chromium: "Failed to fetch".
 *  - Firefox: "NetworkError when attempting to fetch resource.".
 *  - Node/undici (web dev, tests): "fetch failed".
 */
const TRANSPORT_MESSAGE =
  /^load failed|^failed to fetch|^networkerror|^fetch failed|network connection was lost|internet connection appears to be offline|hostname could not be found|could not connect to the server|request timed out/i;

/**
 * A transport-level network failure: the device is offline or the host is
 * unreachable, and the request never produced a response. Browsers report
 * every such failure as a `TypeError` with an engine-specific message
 * (HOU-1085: a sleep-wake burst fails every live gateway query at once with
 * WebKit's "Load failed"). These are an expected, explainable environment
 * state — surfaced as a connectivity toast, never the red bug pair + Sentry.
 */
export function isNetworkTransportError(err: unknown): boolean {
  return err instanceof TypeError && TRANSPORT_MESSAGE.test(err.message);
}

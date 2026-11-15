/**
 * WebKit (the macOS desktop webview) rejects `Response.json()` with a
 * `DOMException` named `SyntaxError` and this fixed message when the gateway
 * connection drops while response bodies are still arriving: several
 * unrelated reads whose headers had landed fail in the same millisecond as a
 * rejected fetch, around a sleep-wake or a stalled event stream
 * (HOUSTON-APP-5BD, -5F0, -5CD). The same routes never fail this way on
 * Chromium, so it is not a gateway answering a 2xx body that is not JSON.
 *
 * The message is WebKit's generic DOM `SyntaxError` text, so it is matched only
 * on a gateway response's `json()`, never globally: elsewhere it can be a
 * coding bug (an invalid selector).
 */
const WEBKIT_BODY_CUT = "The string did not match the expected pattern.";

function isWebKitBodyCut(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === "SyntaxError" &&
    err.message === WEBKIT_BODY_CUT
  );
}

/**
 * Make a body cut on `res.json()` reject with the transport-shaped `TypeError`
 * every other engine produces. The "Load failed" prefix is what
 * `@houston/sdk/transport-failure` keys on, so the failure surfaces as the one
 * deduped connectivity notice and the read-retry paths treat it as a drop.
 */
export function withBodyCutAsTransport(res: Response): Response {
  const json = res.json.bind(res);
  res.json = async () => {
    try {
      return await json();
    } catch (err) {
      if (!isWebKitBodyCut(err)) throw err;
      throw new TypeError("Load failed (response body cut)", { cause: err });
    }
  };
  return res;
}

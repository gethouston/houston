/**
 * Decode a gateway response's `json()` as `text()` then `JSON.parse`.
 *
 * WebKit (the macOS desktop webview) rejects `Response.json()` with one
 * generic DOMException, "The string did not match the expected pattern.",
 * for every body it cannot parse: an HTML page, an empty 200, a 204. Those
 * reports (HOUSTON-APP-5BD, -5F0, -5CD) named neither the cause nor the body,
 * so a dropped stream and a gateway bug read the same. Split in two, each
 * failure says which it is:
 *
 * - A stream that drops mid-body makes `text()` reject with the engine's own
 *   transport `TypeError` ("Load failed"), which `@houston/sdk/transport-failure`
 *   already classifies as connectivity.
 * - A body that arrived but is not JSON fails as a `SyntaxError` naming the
 *   status, content type and length (never the body, which can hold user
 *   data), so it stays a reported failure with something to triage. A JSON
 *   body that ends early is in this group too: the stream finished, so the
 *   gateway sent it short.
 *
 * Every caller gets the same parsed value `json()` would have answered.
 */
export function withTextDecodedJson(res: Response): Response {
  res.json = async () => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      const type = res.headers.get("content-type") ?? "no content type";
      throw new SyntaxError(
        `gateway answered ${res.status} (${type}, ${text.length} chars) that is not JSON: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  };
  return res;
}

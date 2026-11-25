const TRANSPORT_MESSAGE =
  /^load failed|^failed to fetch|^network error$|^networkerror|^fetch failed|network connection was lost|internet connection appears to be offline|hostname could not be found|could not connect to the server|request timed out/i;

// WHY: Matches each engine's fixed message; a match never proves the server did not act. ADR-0019
/**
 * Whether `err` is a `fetch` transport rejection, never a coding bug. The
 * connection failed before the answer arrived or while its body streamed, so
 * a match does not prove the server never acted on the request: it must not
 * justify replaying a non-idempotent one.
 */
export function isTransportFailure(err: unknown): err is TypeError {
  return err instanceof TypeError && TRANSPORT_MESSAGE.test(err.message);
}

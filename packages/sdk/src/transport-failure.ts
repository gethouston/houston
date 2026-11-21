const TRANSPORT_MESSAGE =
  /^load failed|^failed to fetch|^network error$|^networkerror|^fetch failed|network connection was lost|internet connection appears to be offline|hostname could not be found|could not connect to the server|request timed out/i;

export function isTransportFailure(err: unknown): err is TypeError {
  return err instanceof TypeError && TRANSPORT_MESSAGE.test(err.message);
}

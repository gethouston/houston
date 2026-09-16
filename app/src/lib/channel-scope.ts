/** Fence async handoffs, including switching away and back before they settle. */
export function createChannelScope(
  readIdentity: () => string,
  subscribe: (changed: () => void) => () => void,
) {
  const identity = readIdentity();
  let stale = false;
  const abort = new AbortController();
  const close = subscribe(() => {
    if (readIdentity() !== identity) {
      stale = true;
      abort.abort();
    }
  });
  const current = () => !stale && readIdentity() === identity;
  return {
    current,
    signal: abort.signal,
    close,
    assertCurrent() {
      if (!current())
        throw new DOMException("Channel scope changed", "AbortError");
    },
  };
}

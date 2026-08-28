/** Bind a tool call's cancellation signal to every fetch started on its behalf. */
export function fetchWithTurnSignal(
  fetchImpl: typeof fetch,
  signal?: AbortSignal | null,
): typeof fetch {
  if (!signal) return fetchImpl;
  return (input, init) =>
    fetchImpl(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
    });
}

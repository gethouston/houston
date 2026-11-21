export async function withOperationSignal<T>(
  parent: AbortSignal | undefined,
  run: (signal: AbortSignal | undefined) => Promise<T>,
): Promise<T> {
  if (!parent || parent.aborted) return run(parent);
  const own = new AbortController();
  const follow = () => own.abort(parent.reason);
  parent.addEventListener("abort", follow, { once: true });
  try {
    return await run(own.signal);
  } finally {
    parent.removeEventListener("abort", follow);
  }
}

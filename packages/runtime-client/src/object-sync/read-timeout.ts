import type { ObjectStore, ReadOptions } from "./object-store";

export class StoreReadTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`store read gave up after ${timeoutMs} ms`);
    this.name = "StoreReadTimeoutError";
  }
}

const SLOWEST_PROGRESS_BYTES_PER_MS = 1_024;
const BATCH_OBJECT_BYTES = 8 * 1024 * 1024;
const BATCH_BODY_BYTES = 64 * 1024 * 1024;

export function withReadTimeout(
  store: Pick<ObjectStore, "download" | "downloadMany">,
  timeoutMs: number,
  sizeOf: (key: string) => number | undefined = () => undefined,
): Pick<ObjectStore, "download" | "downloadMany"> {
  const bounded = (bytes: number, opts?: ReadOptions): ReadOptions => {
    const limitMs =
      timeoutMs + Math.ceil(bytes / SLOWEST_PROGRESS_BYTES_PER_MS);
    const deadline = AbortSignal.timeout(limitMs);
    const timedOut = new AbortController();
    deadline.addEventListener(
      "abort",
      () => timedOut.abort(new StoreReadTimeoutError(limitMs)),
      { once: true },
    );
    return {
      ...opts,
      signal: opts?.signal
        ? AbortSignal.any([opts.signal, timedOut.signal])
        : timedOut.signal,
    };
  };
  const downloadMany = store.downloadMany?.bind(store);
  return {
    download: (key, destFile, opts) =>
      store.download(key, destFile, bounded(sizeOf(key) ?? 0, opts)),
    ...(downloadMany
      ? {
          downloadMany: (entries, opts) =>
            downloadMany(
              entries,
              bounded(
                Math.min(
                  BATCH_BODY_BYTES,
                  entries.reduce(
                    (sum, { key }) =>
                      sum + Math.min(sizeOf(key) ?? 0, BATCH_OBJECT_BYTES),
                    0,
                  ),
                ),
                opts,
              ),
            ),
        }
      : {}),
  };
}

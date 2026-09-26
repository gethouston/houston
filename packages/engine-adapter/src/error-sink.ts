/**
 * Where the adapter reports a failure it absorbs: a read that degrades and
 * still answers has no caller to throw to, yet the failure must reach the
 * app's reporting path (frontend log, PostHog, Sentry). The app installs that
 * path at startup; until then the console carries it, so nothing is silent.
 */
export type AdapterErrorSink = (source: string, error: unknown) => void;

let sink: AdapterErrorSink = (source, error) =>
  console.error(`[${source}]`, error);

export function setAdapterErrorSink(next: AdapterErrorSink): void {
  sink = next;
}

export function reportAdapterError(source: string, error: unknown): void {
  sink(source, error);
}

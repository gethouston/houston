import { setUnreadableWireSink } from "@houston/wire-types";

export type AdapterErrorSink = (source: string, error: unknown) => void;

let sink: AdapterErrorSink = (source, error) =>
  console.error(`[${source}]`, error);

export function setAdapterErrorSink(next: AdapterErrorSink): void {
  sink = next;
  setUnreadableWireSink(next);
}

export function reportAdapterError(source: string, error: unknown): void {
  sink(source, error);
}

export type UnreadableWireSink = (source: string, error: unknown) => void;

let sink: UnreadableWireSink = (source, error) =>
  console.error(`[${source}]`, error);

export function setUnreadableWireSink(next: UnreadableWireSink): void {
  sink = next;
}

export function reportUnreadableWire(source: string, error: unknown): void {
  sink(source, error);
}

/**
 * Where a parser reports a wire value it could not read and replaced with a
 * safe fallback. The fallback keeps the screen working; the report keeps the
 * mismatch from being silent to us. The client installs its reporting path at
 * startup (the engine adapter's error sink); until then the console has it.
 */
export type UnreadableWireSink = (source: string, error: unknown) => void;

let sink: UnreadableWireSink = (source, error) =>
  console.error(`[${source}]`, error);

export function setUnreadableWireSink(next: UnreadableWireSink): void {
  sink = next;
}

export function reportUnreadableWire(source: string, error: unknown): void {
  sink(source, error);
}

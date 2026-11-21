import {
  type BrowserLiveEvent,
  parseBrowserLiveEvent,
} from "@houston/wire-types";

const KNOWN: ReadonlySet<string> = new Set<BrowserLiveEvent["type"]>([
  "frame",
  "page",
  "status",
]);

export function readLiveEvent(
  raw: unknown,
  onMalformed?: (error: unknown) => void,
): BrowserLiveEvent | null {
  const type =
    raw !== null && typeof raw === "object"
      ? (raw as { type?: unknown }).type
      : undefined;
  if (typeof type === "string" && !KNOWN.has(type)) return null;
  try {
    return parseBrowserLiveEvent(raw);
  } catch (err) {
    if (!onMalformed) throw err;
    onMalformed(err);
    return null;
  }
}

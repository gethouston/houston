import {
  BROWSER_LIVE_MAX_BODY_BYTES,
  BROWSER_LIVE_MAX_EVENTS,
  BROWSER_LIVE_MAX_TEXT,
  type BrowserLiveInput,
} from "@houston/wire-types";

const ENVELOPE_BYTES = 1024;
export const TEXT_EVENT_BYTES = 16 * 1024;

const encoder = new TextEncoder();

export function encodedBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

function charBytes(ch: string): number {
  const code = ch.charCodeAt(0);
  if (
    ch.length === 1 &&
    code >= 0x20 &&
    code < 0x7f &&
    ch !== '"' &&
    ch !== "\\"
  )
    return 1;
  return encodedBytes(ch) - 2;
}

export function isMove(event: BrowserLiveInput): boolean {
  return event.type === "mouse" && event.action === "move";
}

export function textEvents(text: string): BrowserLiveInput[] {
  const out: BrowserLiveInput[] = [];
  let chunk = "";
  let bytes = 2;
  for (const ch of text) {
    const cost = charBytes(ch);
    if (
      chunk &&
      (chunk.length + ch.length > BROWSER_LIVE_MAX_TEXT ||
        bytes + cost > TEXT_EVENT_BYTES)
    ) {
      out.push({ type: "text", text: chunk });
      chunk = "";
      bytes = 2;
    }
    chunk += ch;
    bytes += cost;
  }
  if (chunk) out.push({ type: "text", text: chunk });
  return out;
}

export function merged(
  last: BrowserLiveInput,
  next: BrowserLiveInput,
): BrowserLiveInput | null {
  if (isMove(last) && isMove(next)) return next;
  if (last.type === "wheel" && next.type === "wheel")
    return { ...next, dx: last.dx + next.dx, dy: last.dy + next.dy };
  if (last.type === "text" && next.type === "text") {
    const text = last.text + next.text;
    const fits =
      text.length <= BROWSER_LIVE_MAX_TEXT &&
      encodedBytes(text) <= TEXT_EVENT_BYTES;
    return fits ? { type: "text", text } : null;
  }
  return null;
}

export function batchSize(queue: readonly BrowserLiveInput[]): number {
  const budget = BROWSER_LIVE_MAX_BODY_BYTES - ENVELOPE_BYTES;
  let bytes = 0;
  let n = 0;
  while (n < queue.length && n < BROWSER_LIVE_MAX_EVENTS) {
    bytes += encodedBytes(queue[n]) + 1;
    if (n > 0 && bytes > budget) break;
    n++;
  }
  return n;
}

export function forRetry(
  events: readonly BrowserLiveInput[],
): BrowserLiveInput[] {
  return events.filter((e, i) => !isMove(e) || i === events.length - 1);
}

export function enqueue(queue: BrowserLiveInput[], event: BrowserLiveInput) {
  const parts = event.type === "text" ? textEvents(event.text) : [event];
  for (const part of parts) {
    const last = queue.at(-1);
    const fold = last ? merged(last, part) : null;
    if (fold) queue[queue.length - 1] = fold;
    else queue.push(part);
  }
}

// Pure helper for routing Sentry Session Replay envelopes.
//
// This module is imported BOTH by the browser Sentry init (lib/sentry.ts) and
// by the Node test runner, so it must stay dependency-free: no @sentry/browser,
// no tauri-plugin-sentry-api, no DOM. Only structural types + plain logic.
//
// Why it exists: Houston pipes every Sentry envelope through the Tauri IPC
// transport into the Rust SDK (see tauri-plugin-sentry-api `defaultOptions`).
// The Rust SDK's envelope parser (sentry-types `EnvelopeItemType`) has no
// variant for `replay_event` / `replay_recording` and no catch-all, so
// `Envelope::from_slice` returns `Err(InvalidItemHeader)` and the plugin's
// `envelope` command silently drops the whole replay envelope. Replay would
// therefore NEVER reach Sentry. lib/sentry.ts uses this predicate to peel
// replay envelopes off the IPC path and send them straight to Sentry over HTTP.

/** Sentry envelope item types that carry Session Replay payloads. */
export type ReplayEnvelopeItemType = "replay_event" | "replay_recording";

const REPLAY_ITEM_TYPES: ReadonlySet<string> = new Set<ReplayEnvelopeItemType>([
  "replay_event",
  "replay_recording",
]);

/**
 * Minimal structural shape of a Sentry envelope: a `[headers, items]` tuple
 * where each item is its own `[itemHeader, payload]` tuple. Sentry's real
 * `Envelope` type is assignable to this — we only ever read each item header's
 * `type`, so we avoid importing the SDK's types into this pure module.
 */
export type EnvelopeLike = readonly [
  unknown,
  ReadonlyArray<readonly [{ type?: string }, unknown]>,
];

/**
 * True when an envelope contains Session Replay items and must bypass the
 * Tauri IPC transport (which the Rust SDK can't parse) in favour of a direct
 * HTTP send to Sentry.
 */
export function isReplayEnvelope(envelope: EnvelopeLike): boolean {
  const items = envelope[1];
  return items.some(
    ([itemHeader]) =>
      typeof itemHeader.type === "string" && REPLAY_ITEM_TYPES.has(itemHeader.type),
  );
}

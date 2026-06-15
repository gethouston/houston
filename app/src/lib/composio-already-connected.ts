/**
 * The engine rejected a Composio "Connect" because the toolkit already has
 * a live connection in the consumer namespace — `composio link` no-ops
 * instead of issuing a fresh auth URL. The engine tags this with a stable
 * `composio_already_connected` kind (see `StartLinkError::AlreadyConnected`
 * -> `CoreError::Labeled` in
 * `engine/houston-engine-server/src/routes/composio.rs`).
 *
 * This is an expected, explainable state, NOT a Houston bug: it means the
 * caller's cached connected-toolkits list was stale, which is why the
 * Connect button was still live. Surfaces refresh that list so the card
 * flips to its connected state, and the engine-call wrapper silences the
 * error (no red bug toast, no Sentry report). See HOU-463.
 */
export const COMPOSIO_ALREADY_CONNECTED_KIND = "composio_already_connected";

/**
 * True when a thrown engine error means the toolkit is already connected.
 * Reads the typed `.kind` exposed by `HoustonEngineError` (and tolerates a
 * plain `{ kind }` object), so it never depends on parsing message strings.
 */
export function isAlreadyConnectedError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "kind" in err &&
    (err as { kind?: unknown }).kind === COMPOSIO_ALREADY_CONNECTED_KIND
  );
}

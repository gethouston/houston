# Local model bridge: design decisions

Covers `crates/local-model-bridge/`: the native session that relays requests from the managed gateway to a model server on the person's machine. Short file paths are relative to that crate.

## Renewal timing lives in the native session

The desktop webview's timers sleep while the app idles (macOS App Nap), so the session itself schedules a renewal two minutes before expiry and again after every renewal moves the expiry.

Lives in `tests/transport.rs`.

## Upload admission

Frames already in flight for an upload rejected beyond the concurrency cap must not kill admitted requests. Upload frames are consumed into the capped validation body and never acknowledged merely on receipt.

Lives in `src/session/requests/upload.rs`.

## Each request id is accepted once

The session keeps a bounded set of seen request ids (65536), sized for a ten-minute renewable session; a repeated id, or a new one once the set is full, is refused.

Lives in `src/session/requests.rs`.

## Payload size without decoding

Base64 payload size is computed from length and padding without decoding or allocating.

Lives in `src/session.rs`.

## Target validation

URL parsers normalize noncanonical numeric hosts, so the original authority text is required. Both resolutions are pinned and the mutable DNS and proxy environment is never consulted. Detection and legacy saved descriptors store an origin (`targetBaseUrl`), not an API prefix, for both `127.0.0.1` and `localhost`.

Lives in `src/target.rs`.

## Streaming

The relay accepts only bare media types, so parameters are stripped locally; the content type must be on the Go session's allowlist or the session closes. The first chunk is delivered before the upstream finishes.

Lives in `src/stream.rs`.

## Shutdown

Transport failures have already reached Offline; shutdown succeeds once every socket and task is released, including a previously closed session.

Lives in `src/lib.rs`.

## Handshake test model

Handshake tests model the gateway answering the upgrade with a plain HTTP status: 401 for an unaccepted ticket, 502 or 503 when no relay is ready. Tungstenite fixes the handshake callback's error type.

Lives in `tests/handshake.rs`.

import Foundation

/// Wire codec for the native-backed **port** frames of the bridge contract
/// (`packages/sdk/BRIDGE.md` §9). Only the frames the *host* participates in
/// live here: inbound port **requests** the SDK sends over the pipe, and the
/// **replies** the host writes back through `JSRuntime.receive`.
///
/// Correlation is by the SDK-minted `id` (a namespace separate from command
/// ids). These types intentionally decode tolerantly — unknown JSON fields are
/// ignored — so a newer SDK never breaks an older host (BRIDGE.md §4).

// MARK: - Well-known keys

/// Storage keys with special custody. The session token is the only key routed
/// to the Keychain; everything else lives in `UserDefaults`.
/// Value mirrors `SESSION_TOKEN_KEY` in
/// `packages/sdk/src/modules/session/auth-fetch.ts`.
enum SessionKeys {
    static let tokenKey = "houston.sdk.session.token"
}

// MARK: - Inbound requests (SDK → host)
//
// A frame's discriminator is read with `BridgeKindPeek` (BridgeMessages.swift),
// the shared cheap `{ kind }` peek, before a full decode here.

/// `fetch/start { id, url, method, headers, body? }` — begin an HTTP request.
struct FetchStartFrame: Decodable {
    let id: String
    let url: String
    let method: String?
    let headers: [String: String]?
    let body: String?
}

/// `fetch/abort { id }` — cancel an in-flight request.
struct FetchAbortFrame: Decodable {
    let id: String
}

/// `storage/get|set|delete { id, key, value? }` — a key/value custody op.
struct StorageFrame: Decodable {
    let id: String
    let key: String
    let value: String?
}

// MARK: - Outbound replies (host → SDK)

/// `fetch/response { id, status, ok }` — resolves the SDK's `Response`.
struct FetchResponseReply: Encodable {
    let kind = "fetch/response"
    let id: String
    let status: Int
    let ok: Bool
}

/// `fetch/chunk { id, bytesBase64 }` — one body chunk, base64-encoded.
struct FetchChunkReply: Encodable {
    let kind = "fetch/chunk"
    let id: String
    let bytesBase64: String
}

/// `fetch/done { id }` — the body ended cleanly.
struct FetchDoneReply: Encodable {
    let kind = "fetch/done"
    let id: String
}

/// `fetch/error { id, message }` — the request/stream failed.
struct FetchErrorReply: Encodable {
    let kind = "fetch/error"
    let id: String
    let message: String
}

/// `storage/result { id, value? }` — one reply per storage op. `value` is
/// carried (string | null) only for a `get`; it is **omitted** for
/// `set`/`delete`.
struct StorageResultReply: Encodable {
    let id: String
    /// Whether to encode the `value` member at all (true only for `get`).
    let includeValue: Bool
    /// The read value; `nil` encodes as JSON `null` (a `get` miss).
    let value: String?

    private enum CodingKeys: String, CodingKey {
        case kind, id, value
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode("storage/result", forKey: .kind)
        try c.encode(id, forKey: .id)
        // `encode` (not `encodeIfPresent`) forces an explicit `null` on a miss.
        if includeValue { try c.encode(value, forKey: .value) }
    }
}

// MARK: - Codec helpers

/// Stateless JSON encode/decode for port frames.
enum PortCodec {
    static func decode<T: Decodable>(_ type: T.Type, from data: Data) -> T? {
        try? JSONDecoder().decode(type, from: data)
    }

    /// Encode a reply frame to a pipe string. Returns `nil` only on an
    /// impossible encoder failure (surfaced by the caller, never swallowed).
    static func encode<T: Encodable>(_ value: T) -> String? {
        guard let data = try? JSONEncoder().encode(value) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

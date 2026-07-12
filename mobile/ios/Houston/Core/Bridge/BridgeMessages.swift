import Foundation

/// Codable mirrors of the bridge wire vocabulary the CLIENT (native host) speaks
/// — the machine-readable form of `packages/sdk/BRIDGE.md`.
///
/// Two halves: ``BridgeInbound`` (host → SDK, what we *produce*) and
/// ``BridgeOutbound`` (SDK → host, what we *consume*). The SDK-level members plus
/// the one-way `log` diagnostic (§9.3) are modeled here. The native-port members
/// (`fetch/*`, `storage/*`) are the ports agent's; ``SdkClient`` peeks their
/// `kind` and routes the raw string through ``SdkPortRouter`` without decoding
/// them, so this transport layer stays agnostic to how the host backs fetch and
/// storage.
///
/// Versioning is additive (BRIDGE.md §4): an unknown outbound `kind` decodes to
/// ``BridgeOutbound/unknown(kind:)`` and is treated as inert, never a crash.

/// A serialized command request. `id` correlates the request to its result.
struct CommandEnvelope: Codable, Equatable {
  let id: String
  let type: String
  var payload: JSONValue?
}

/// The outcome of a dispatched command, echoed back correlated by `id`.
struct CommandResult: Codable, Equatable {
  let id: String
  let ok: Bool
  var value: JSONValue?
  var error: CommandErrorPayload?
}

/// The `{ message, status? }` error body carried on a failed ``CommandResult``.
struct CommandErrorPayload: Codable, Equatable {
  let message: String
  var status: Int?
}

/// The `{ type, scope?, data? }` one-shot signal carried on an `event` frame.
struct SdkEventPayload: Codable, Equatable {
  let type: String
  var scope: String?
  var data: JSONValue?
}

// MARK: - Inbound (host → SDK)

/// host → SDK messages the host produces. Only the four base members are needed
/// on the client's send path; native-port *replies* are emitted by the ports
/// agent, not here.
enum BridgeInbound: Encodable, Equatable {
  case configure(baseUrl: String, native: NativePorts?)
  case command(CommandEnvelope)
  case subscribe(sub: String, scope: String)
  case unsubscribe(sub: String)

  private enum CodingKeys: String, CodingKey {
    case kind, baseUrl, native, envelope, sub, scope
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case let .configure(baseUrl, native):
      try container.encode("configure", forKey: .kind)
      try container.encode(baseUrl, forKey: .baseUrl)
      try container.encodeIfPresent(native, forKey: .native)
    case let .command(envelope):
      try container.encode("command", forKey: .kind)
      try container.encode(envelope, forKey: .envelope)
    case let .subscribe(sub, scope):
      try container.encode("subscribe", forKey: .kind)
      try container.encode(sub, forKey: .sub)
      try container.encode(scope, forKey: .scope)
    case let .unsubscribe(sub):
      try container.encode("unsubscribe", forKey: .kind)
      try container.encode(sub, forKey: .sub)
    }
  }

  /// Serialize this inbound message to the single JSON string the pipe carries.
  func serialized() throws -> String {
    let data = try JSONEncoder().encode(self)
    guard let string = String(data: data, encoding: .utf8) else {
      throw BridgeCodecError.notUTF8
    }
    return string
  }
}

/// Which capability ports the host services natively (BRIDGE.md §2.1).
struct NativePorts: Codable, Equatable {
  var storage: Bool?
  var fetch: Bool?
}

enum BridgeCodecError: Error { case notUTF8 }

// MARK: - Outbound (SDK → host)

/// SDK → host messages the host consumes: the SDK-level members plus the `log`
/// diagnostic (§9.3). The `fetch/*`/`storage/*` port members are routed by `kind`
/// before this decodes; an unrecognized `kind` is inert `.unknown`.
enum BridgeOutbound: Equatable {
  case ready(v: Int)
  case result(CommandResult)
  case subscribed(sub: String, scope: String, snapshot: JSONValue?)
  case snapshot(sub: String, scope: String, snapshot: JSONValue)
  case event(SdkEventPayload)
  case fatal(reason: String, message: String)
  case error(message: String, detail: JSONValue?)
  case log(SdkLogPayload)
  case unknown(kind: String)
}

extension BridgeOutbound: Codable {
  private enum CodingKeys: String, CodingKey {
    case kind, v, result, sub, scope, snapshot, event, reason, message, detail
    case level, fields
  }

  func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case let .ready(v):
      try c.encode("ready", forKey: .kind)
      try c.encode(v, forKey: .v)
    case let .result(result):
      try c.encode("result", forKey: .kind)
      try c.encode(result, forKey: .result)
    case let .subscribed(sub, scope, snapshot):
      try c.encode("subscribed", forKey: .kind)
      try c.encode(sub, forKey: .sub)
      try c.encode(scope, forKey: .scope)
      try c.encodeIfPresent(snapshot, forKey: .snapshot)
    case let .snapshot(sub, scope, snapshot):
      try c.encode("snapshot", forKey: .kind)
      try c.encode(sub, forKey: .sub)
      try c.encode(scope, forKey: .scope)
      try c.encode(snapshot, forKey: .snapshot)
    case let .event(payload):
      try c.encode("event", forKey: .kind)
      try c.encode(payload, forKey: .event)
    case let .fatal(reason, message):
      try c.encode("fatal", forKey: .kind)
      try c.encode(reason, forKey: .reason)
      try c.encode(message, forKey: .message)
    case let .error(message, detail):
      try c.encode("error", forKey: .kind)
      try c.encode(message, forKey: .message)
      try c.encodeIfPresent(detail, forKey: .detail)
    case let .log(payload):
      try c.encode("log", forKey: .kind)
      // Level/message/fields are flat siblings of `kind` on the frame (§9.3).
      try payload.encode(to: encoder)
    case let .unknown(kind):
      try c.encode(kind, forKey: .kind)
    }
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let kind = try container.decode(String.self, forKey: .kind)
    switch kind {
    case "ready":
      self = .ready(v: try container.decode(Int.self, forKey: .v))
    case "result":
      self = .result(try container.decode(CommandResult.self, forKey: .result))
    case "subscribed":
      self = .subscribed(
        sub: try container.decode(String.self, forKey: .sub),
        scope: try container.decode(String.self, forKey: .scope),
        snapshot: try container.decodeIfPresent(JSONValue.self, forKey: .snapshot))
    case "snapshot":
      self = .snapshot(
        sub: try container.decode(String.self, forKey: .sub),
        scope: try container.decode(String.self, forKey: .scope),
        snapshot: try container.decode(JSONValue.self, forKey: .snapshot))
    case "event":
      self = .event(try container.decode(SdkEventPayload.self, forKey: .event))
    case "fatal":
      self = .fatal(
        reason: try container.decode(String.self, forKey: .reason),
        message: try container.decode(String.self, forKey: .message))
    case "error":
      self = .error(
        message: try container.decode(String.self, forKey: .message),
        detail: try container.decodeIfPresent(JSONValue.self, forKey: .detail))
    case "log":
      // Flat frame (§9.3): payload reads level/message/fields off this decoder,
      // so a `log` line is dispatched, never dropped into inert `.unknown`.
      self = .log(try SdkLogPayload(from: decoder))
    default:
      self = .unknown(kind: kind)
    }
  }
}

/// Cheap first-pass parse: read only `kind` so ``SdkClient`` can route port
/// messages (`fetch/*`, `storage/*`) without decoding their bodies.
struct BridgeKindPeek: Decodable { let kind: String }

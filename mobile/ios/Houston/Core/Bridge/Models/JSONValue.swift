import Foundation

/// A tolerant, loss-preserving mirror of an arbitrary JSON value.
///
/// The bridge (`BRIDGE.md`) carries several *open* fields whose shape the SDK
/// owns and evolves additively — a command `payload`, a `result.value`, a scope
/// `snapshot`, an event `data`. The host must accept whatever lands there today
/// AND survive fields it does not yet model (BRIDGE.md §4). `JSONValue` is that
/// escape hatch: it decodes any JSON without loss, round-trips byte-for-byte
/// through `Codable`, and re-projects into a typed `Decodable` on demand.
///
/// Integers are kept distinct from doubles so millisecond timestamps
/// (`createdAt`) survive a round-trip as `Int`, not `1.751e12`.
enum JSONValue: Codable, Equatable, Sendable {
  case null
  case bool(Bool)
  case int(Int)
  case double(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Int.self) {
      self = .int(value)
    } else if let value = try? container.decode(Double.self) {
      self = .double(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
    } else if let value = try? container.decode([String: JSONValue].self) {
      self = .object(value)
    } else {
      throw DecodingError.dataCorruptedError(
        in: container, debugDescription: "unrepresentable JSON value")
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null: try container.encodeNil()
    case let .bool(value): try container.encode(value)
    case let .int(value): try container.encode(value)
    case let .double(value): try container.encode(value)
    case let .string(value): try container.encode(value)
    case let .array(value): try container.encode(value)
    case let .object(value): try container.encode(value)
    }
  }
}

extension JSONValue {
  /// Object-member access sugar; `nil` for non-objects or absent keys.
  subscript(key: String) -> JSONValue? {
    if case let .object(members) = self { return members[key] }
    return nil
  }

  /// The string payload when this value is a string, else `nil`.
  var stringValue: String? {
    if case let .string(value) = self { return value }
    return nil
  }

  /// The integer payload when this value is an integer, else `nil`.
  var intValue: Int? {
    if case let .int(value) = self { return value }
    return nil
  }

  /// Re-encode this value and decode it as `T`. The typed projection seam used
  /// for `result.value`, scope `snapshot`s, and event `data`. Throws loudly on a
  /// shape mismatch — a decode failure is never swallowed. Uses per-call coders
  /// (`JSONEncoder`/`Decoder` are not safe to share across threads), so a feed
  /// projection off the main actor is race-free.
  func decode<T: Decodable>(_ type: T.Type = T.self) throws -> T {
    let data = try JSONEncoder().encode(self)
    return try JSONDecoder().decode(T.self, from: data)
  }
}

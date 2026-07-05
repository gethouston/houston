import Foundation

@testable import Houston

/// A `MissionCommandRunning` test double: records each dispatched command and
/// returns canned results (or throws) keyed by command type. Lets the action /
/// search / create flows be tested without standing up the bridge.
@MainActor
final class MissionCommandRunnerStub: MissionCommandRunning {
  struct Call: Equatable {
    let type: String
    let payload: JSONValue
  }

  private(set) var calls: [Call] = []
  /// Result `value` returned for a command type (decoded into the caller's `T`).
  var responses: [String: JSONValue] = [:]
  /// Errors thrown for a command type, taking precedence over `responses`.
  var failures: [String: Error] = [:]

  func command<P: Encodable, T: Decodable>(_ type: String, _ payload: P) async throws -> T {
    calls.append(Call(type: type, payload: Self.encode(payload)))
    if let error = failures[type] { throw error }
    let value = responses[type] ?? .object([:])
    return try value.decode(T.self)
  }

  /// The command types dispatched, in order.
  var dispatchedTypes: [String] { calls.map(\.type) }

  /// The most recent payload for `type`, if any.
  func lastPayload(for type: String) -> JSONValue? {
    calls.last(where: { $0.type == type })?.payload
  }

  private static func encode<P: Encodable>(_ payload: P) -> JSONValue {
    guard let data = try? JSONEncoder().encode(payload),
          let value = try? JSONDecoder().decode(JSONValue.self, from: data)
    else { return .null }
    return value
  }
}

/// A trivial error for seeding failure paths in tests.
struct StubError: Error, Equatable {
  let message: String
  init(_ message: String = "stub failure") { self.message = message }
}

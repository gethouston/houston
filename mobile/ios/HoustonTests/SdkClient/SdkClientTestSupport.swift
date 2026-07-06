import Foundation
import XCTest

@testable import Houston

/// An in-memory ``SdkBridgeTransport`` for driving ``SdkClient`` without a JS
/// engine. Inbound messages the client delivers are captured; `send(_:)`
/// simulates an SDK → host outbound frame (invoked synchronously, on the main
/// actor, as the real transport contract requires).
@MainActor
final class MockTransport: SdkBridgeTransport {
  var onOutbound: (@MainActor (String) -> Void)?
  private(set) var delivered: [String] = []
  private(set) var booted = false
  var bootError: Error?

  /// Called synchronously each time the client delivers an inbound message —
  /// lets a test auto-respond (the JS `send`-during-`receive` case, §8).
  var onDeliver: ((String) -> Void)?

  func boot() async throws {
    if let bootError { throw bootError }
    booted = true
  }

  func deliver(_ message: String) {
    delivered.append(message)
    onDeliver?(message)
  }

  /// Simulate an SDK → host outbound message string.
  func send(_ message: String) { onOutbound?(message) }
}

enum BridgeTestJSON {
  /// Encode an outbound frame to the string the transport would deliver.
  static func encode(_ outbound: BridgeOutbound) -> String {
    let data = try! JSONEncoder().encode(outbound)
    return String(data: data, encoding: .utf8)!
  }

  /// Extract the command envelope from a captured `command` inbound message.
  static func envelope(from raw: String) -> CommandEnvelope? {
    struct Wrap: Decodable { let envelope: CommandEnvelope }
    guard let data = raw.data(using: .utf8) else { return nil }
    return (try? JSONDecoder().decode(Wrap.self, from: data))?.envelope
  }

  /// The `kind` of a captured inbound message.
  static func kind(of raw: String) -> String? {
    guard let data = raw.data(using: .utf8) else { return nil }
    return (try? JSONDecoder().decode(BridgeKindPeek.self, from: data))?.kind
  }

  /// The `sub` id of a captured `subscribe`/`unsubscribe` inbound message.
  static func sub(from raw: String) -> String? {
    struct Wrap: Decodable { let sub: String? }
    guard let data = raw.data(using: .utf8) else { return nil }
    return (try? JSONDecoder().decode(Wrap.self, from: data))?.sub
  }

  /// The `scope` of a captured `subscribe` inbound message.
  static func scope(from raw: String) -> String? {
    struct Wrap: Decodable { let scope: String? }
    guard let data = raw.data(using: .utf8) else { return nil }
    return (try? JSONDecoder().decode(Wrap.self, from: data))?.scope
  }

  /// Decode a JSON string literal into a model type.
  static func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
  }
}

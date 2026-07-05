import XCTest

@testable import Houston

/// Envelope codec round-trips: the inbound frames the host serializes and the
/// outbound frames it decodes, pinned to the shapes in BRIDGE.md.
final class BridgeMessagesTests: XCTestCase {
  private func object(_ raw: String) throws -> [String: Any] {
    try XCTUnwrap(
      try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
  }

  // MARK: Inbound serialization

  func testConfigureSerializes() throws {
    let raw = try BridgeInbound.configure(
      baseUrl: "http://127.0.0.1:4317", native: NativePorts(storage: true, fetch: nil)
    ).serialized()
    let obj = try object(raw)
    XCTAssertEqual(obj["kind"] as? String, "configure")
    XCTAssertEqual(obj["baseUrl"] as? String, "http://127.0.0.1:4317")
    XCTAssertEqual((obj["native"] as? [String: Any])?["storage"] as? Bool, true)
  }

  func testCommandSerializesWithEnvelope() throws {
    let envelope = CommandEnvelope(
      id: "c1", type: "session/setToken", payload: .object(["token": .string("jwt")]))
    let raw = try BridgeInbound.command(envelope).serialized()
    let obj = try object(raw)
    XCTAssertEqual(obj["kind"] as? String, "command")
    let decoded = BridgeTestJSON.envelope(from: raw)
    XCTAssertEqual(decoded, envelope)
  }

  func testSubscribeAndUnsubscribeSerialize() throws {
    let sub = try BridgeInbound.subscribe(sub: "s1", scope: "agents").serialized()
    XCTAssertEqual(BridgeTestJSON.kind(of: sub), "subscribe")
    XCTAssertEqual(BridgeTestJSON.sub(from: sub), "s1")
    let unsub = try BridgeInbound.unsubscribe(sub: "s1").serialized()
    XCTAssertEqual(BridgeTestJSON.kind(of: unsub), "unsubscribe")
    XCTAssertEqual(BridgeTestJSON.sub(from: unsub), "s1")
  }

  // MARK: Outbound decoding

  private func decodeOutbound(_ raw: String) throws -> BridgeOutbound {
    try JSONDecoder().decode(BridgeOutbound.self, from: Data(raw.utf8))
  }

  func testDecodesReady() throws {
    XCTAssertEqual(try decodeOutbound(#"{"kind":"ready","v":1}"#), .ready(v: 1))
  }

  func testDecodesResultOkAndError() throws {
    let ok = try decodeOutbound(#"{"kind":"result","result":{"id":"c1","ok":true,"value":42}}"#)
    guard case let .result(r) = ok else { return XCTFail("expected result") }
    XCTAssertEqual(r.id, "c1")
    XCTAssertEqual(r.value, .int(42))

    let err = try decodeOutbound(
      #"{"kind":"result","result":{"id":"c2","ok":false,"error":{"message":"unauthorized","status":401}}}"#)
    guard case let .result(r2) = err else { return XCTFail("expected result") }
    XCTAssertEqual(r2.error?.status, 401)
    XCTAssertEqual(r2.error?.message, "unauthorized")
  }

  func testDecodesSubscribedWithAndWithoutSnapshot() throws {
    let bare = try decodeOutbound(#"{"kind":"subscribed","sub":"s1","scope":"agents"}"#)
    XCTAssertEqual(bare, .subscribed(sub: "s1", scope: "agents", snapshot: nil))
    let withSnap = try decodeOutbound(
      #"{"kind":"subscribed","sub":"s1","scope":"agents","snapshot":{"loaded":true}}"#)
    XCTAssertEqual(
      withSnap,
      .subscribed(sub: "s1", scope: "agents", snapshot: .object(["loaded": .bool(true)])))
  }

  func testDecodesSnapshotEventFatalError() throws {
    let snap = try decodeOutbound(#"{"kind":"snapshot","sub":"s1","scope":"agents","snapshot":[]}"#)
    XCTAssertEqual(snap, .snapshot(sub: "s1", scope: "agents", snapshot: .array([])))

    let event = try decodeOutbound(
      #"{"kind":"event","event":{"type":"approval/needed","scope":"conversation/cv_42"}}"#)
    guard case let .event(payload) = event else { return XCTFail("expected event") }
    XCTAssertEqual(payload.type, "approval/needed")
    XCTAssertEqual(payload.scope, "conversation/cv_42")

    let fatal = try decodeOutbound(#"{"kind":"fatal","reason":"tokenExpired","message":"gone"}"#)
    XCTAssertEqual(fatal, .fatal(reason: "tokenExpired", message: "gone"))

    let error = try decodeOutbound(#"{"kind":"error","message":"bad frame"}"#)
    XCTAssertEqual(error, .error(message: "bad frame", detail: nil))
  }

  func testUnknownKindIsInert() throws {
    // A future member (or an unrouted port frame) decodes to `.unknown`, never a throw.
    XCTAssertEqual(try decodeOutbound(#"{"kind":"fetch/start","id":"f1"}"#), .unknown(kind: "fetch/start"))
    XCTAssertEqual(try decodeOutbound(#"{"kind":"log","level":"info","message":"hi"}"#), .unknown(kind: "log"))
  }

  func testOutboundRoundTrips() throws {
    let cases: [BridgeOutbound] = [
      .ready(v: 1),
      .result(CommandResult(id: "c1", ok: true, value: .string("v"), error: nil)),
      .snapshot(sub: "s1", scope: "agents", snapshot: .array([])),
      .fatal(reason: "tokenExpired", message: "gone"),
    ]
    for value in cases {
      XCTAssertEqual(try decodeOutbound(BridgeTestJSON.encode(value)), value)
    }
  }
}

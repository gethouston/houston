import XCTest

@testable import Houston

/// The grant-load path of `IntegrationsModel` (PARITY-SETTINGS §3, landmine 5).
///
/// The load feeds a per-agent `integrations/grants` read whose result is
/// tri-state: `null` → UNSUPPORTED for that agent, `[]` → nothing granted, and a
/// list → those slugs. A THROWN read (transient 500 / network / timeout) is a
/// FOURTH outcome that must NOT be folded into "unsupported → every agent
/// allowed" — it surfaces as a retriable load error (no-silent-failures). These
/// drive the model with no JS engine, seeding a ready integrations VM + one agent
/// so the grant load fires, then vary the `integrations/grants` reply.
@MainActor
final class IntegrationsModelGrantsTests: XCTestCase {
  private enum GrantsReply {
    case fail(String, Int?)
    case ok([String]?)  // nil → JSON-null (unsupported); [] / list → a real array
  }

  /// A client that answers scope `subscribe`s with a ready integrations VM + one
  /// agent (`a1`), answers `integrations/grants` per `reply()`, and OKs the rest.
  private func makeClient(reply: @escaping () -> GrantsReply) -> SdkClient {
    let transport = MockTransport()
    let client = SdkClient(transport: transport)
    transport.onDeliver = { raw in
      if BridgeTestJSON.kind(of: raw) == "subscribe" {
        guard let sub = BridgeTestJSON.sub(from: raw),
          let scope = BridgeTestJSON.scope(from: raw)
        else { return }
        client.receiveOutbound(
          BridgeTestJSON.encode(.subscribed(sub: sub, scope: scope, snapshot: Self.seed(scope))))
        return
      }
      guard let env = BridgeTestJSON.envelope(from: raw) else { return }
      let result: CommandResult
      if env.type == IntegrationsCommand.grants {
        switch reply() {
        case let .fail(message, status):
          result = CommandResult(
            id: env.id, ok: false, value: nil,
            error: CommandErrorPayload(message: message, status: status))
        case let .ok(list):
          let value: JSONValue = list.map { .array($0.map(JSONValue.string)) } ?? .null
          result = CommandResult(id: env.id, ok: true, value: value, error: nil)
        }
      } else {
        result = CommandResult(id: env.id, ok: true, value: nil, error: nil)
      }
      client.receiveOutbound(BridgeTestJSON.encode(.result(result)))
    }
    return client
  }

  private static func seed(_ scope: String) -> JSONValue {
    switch scope {
    case SdkScope.integrations:
      return json(
        """
        { "loaded": true, "ready": true,
          "toolkits": [{ "slug": "gmail", "name": "Gmail" }],
          "connections": [{ "toolkit": "gmail", "connectionId": "c1", "status": "active" }] }
        """)
    case SdkScope.agents:
      return json(
        """
        { "loaded": true,
          "items": [{ "id": "a1", "name": "Agent", "workspaceId": "w1", "createdAt": 0 }] }
        """)
    default:
      return .object([:])
    }
  }

  private static func json(_ string: String) -> JSONValue {
    try! JSONDecoder().decode(JSONValue.self, from: Data(string.utf8))
  }

  /// Await until the grant load leaves `.loading` (settles to loaded/failed).
  private func settle(_ model: IntegrationsModel) async {
    for _ in 0..<200 {
      if model.grantsLoad != .loading { return }
      try? await Task.sleep(for: .milliseconds(1))
    }
  }

  // MARK: The bug — a thrown read must not read as "unsupported / all agents"

  func testThrownGrantReadSurfacesErrorNotUnsupported() async {
    let model = IntegrationsModel(client: makeClient { .fail("boom", 500) })
    let token = model.retain()
    await settle(model)

    XCTAssertEqual(model.grantsError, "boom", "a thrown read must surface its reason")
    XCTAssertFalse(model.grantsLoaded, "a failed load is not 'loaded'")
    XCTAssertTrue(
      model.grants.supported,
      "a transient read error must NOT render as unsupported (every-agent-allowed)")
    token.cancel()
  }

  // MARK: The distinction it must preserve — JSON-null really is unsupported

  func testNullGrantReadMapsToUnsupportedNotError() async {
    let model = IntegrationsModel(client: makeClient { .ok(nil) })
    let token = model.retain()
    await settle(model)

    XCTAssertNil(model.grantsError, "a returned JSON-null is unsupported, not a failure")
    XCTAssertTrue(model.grantsLoaded)
    XCTAssertFalse(model.grants.supported, "null → grants unsupported for that agent")
    token.cancel()
  }

  func testEmptyArrayGrantReadIsLoadedAndSupported() async {
    let model = IntegrationsModel(client: makeClient { .ok([]) })
    let token = model.retain()
    await settle(model)

    XCTAssertNil(model.grantsError)
    XCTAssertTrue(model.grantsLoaded)
    XCTAssertTrue(model.grants.supported, "[] is nothing-granted, still supported")
    XCTAssertEqual(model.grants.grants(for: "a1"), [])
    token.cancel()
  }

  func testPopulatedGrantReadLoadsTheSlugs() async {
    let model = IntegrationsModel(client: makeClient { .ok(["gmail"]) })
    let token = model.retain()
    await settle(model)

    XCTAssertNil(model.grantsError)
    XCTAssertTrue(model.grantsLoaded)
    XCTAssertEqual(model.grants.grants(for: "a1"), ["gmail"])
    token.cancel()
  }

  // MARK: Retry recovers from a failure

  func testReloadGrantsRecoversAfterFailure() async {
    var fail = true
    let model = IntegrationsModel(client: makeClient { fail ? .fail("boom", 500) : .ok(["gmail"]) })
    let token = model.retain()
    await settle(model)
    XCTAssertEqual(model.grantsError, "boom")

    fail = false
    await model.reloadGrants()

    XCTAssertNil(model.grantsError, "retry clears the error once the read succeeds")
    XCTAssertTrue(model.grantsLoaded)
    XCTAssertEqual(model.grants.grants(for: "a1"), ["gmail"])
    token.cancel()
  }
}

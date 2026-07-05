import XCTest

@testable import Houston

/// Scope subscription lifecycle + decode tolerance.
@MainActor
final class ScopeStoreTests: XCTestCase {
  private func makeClient() -> (SdkClient, MockTransport) {
    let transport = MockTransport()
    return (SdkClient(transport: transport), transport)
  }

  func testRetainSubscribesAndDeliversSnapshot() throws {
    let (client, transport) = makeClient()
    let store = client.scope(SdkScope.agents, as: AgentsViewModel.self)
    let token = store.retain()

    let subscribeMsg = try XCTUnwrap(transport.delivered.last)
    XCTAssertEqual(BridgeTestJSON.kind(of: subscribeMsg), "subscribe")
    let sub = try XCTUnwrap(BridgeTestJSON.sub(from: subscribeMsg))

    let snapshot = JSONValue.object(["loaded": .bool(true), "items": .array([])])
    client.receiveOutbound(BridgeTestJSON.encode(.snapshot(sub: sub, scope: SdkScope.agents, snapshot: snapshot)))

    XCTAssertEqual(store.snapshot?.loaded, true)
    XCTAssertNil(store.lastError)
    token.cancel()
  }

  func testInitialSnapshotFromSubscribedFrame() throws {
    let (client, transport) = makeClient()
    let store = client.scope(SdkScope.agents, as: AgentsViewModel.self)
    let token = store.retain()
    let sub = try XCTUnwrap(BridgeTestJSON.sub(from: try XCTUnwrap(transport.delivered.last)))
    let snapshot = JSONValue.object(["loaded": .bool(true), "items": .array([])])
    client.receiveOutbound(
      BridgeTestJSON.encode(.subscribed(sub: sub, scope: SdkScope.agents, snapshot: snapshot)))
    XCTAssertEqual(store.snapshot?.loaded, true)
    token.cancel()
  }

  func testDecodeFailureSetsLastErrorAndKeepsPriorSnapshot() throws {
    let (client, transport) = makeClient()
    let store = client.scope(SdkScope.agents, as: AgentsViewModel.self)
    let token = store.retain()
    let sub = try XCTUnwrap(BridgeTestJSON.sub(from: try XCTUnwrap(transport.delivered.last)))

    let good = JSONValue.object(["loaded": .bool(true), "items": .array([])])
    client.receiveOutbound(BridgeTestJSON.encode(.snapshot(sub: sub, scope: SdkScope.agents, snapshot: good)))
    let bad = JSONValue.object(["loaded": .string("not a bool")])
    client.receiveOutbound(BridgeTestJSON.encode(.snapshot(sub: sub, scope: SdkScope.agents, snapshot: bad)))

    XCTAssertEqual(store.snapshot?.loaded, true, "prior good snapshot must survive a bad one")
    XCTAssertNotNil(store.lastError)
    token.cancel()
  }

  func testLastReleaseUnsubscribes() async throws {
    let (client, transport) = makeClient()
    let store = client.scope(SdkScope.agents, as: AgentsViewModel.self)
    let first = store.retain()
    let second = store.retain()
    // Only one subscribe for two retentions.
    XCTAssertEqual(transport.delivered.filter { BridgeTestJSON.kind(of: $0) == "subscribe" }.count, 1)

    first.cancel()
    try? await Task.sleep(for: .milliseconds(50))
    XCTAssertFalse(
      transport.delivered.contains { BridgeTestJSON.kind(of: $0) == "unsubscribe" },
      "not yet — one retention still held")

    second.cancel()
    try? await Task.sleep(for: .milliseconds(50))
    XCTAssertTrue(transport.delivered.contains { BridgeTestJSON.kind(of: $0) == "unsubscribe" })
  }

  func testSameScopeReturnsSharedStore() {
    let (client, _) = makeClient()
    let a = client.scope(SdkScope.agents, as: AgentsViewModel.self)
    let b = client.scope(SdkScope.agents, as: AgentsViewModel.self)
    XCTAssertTrue(a === b)
  }
}

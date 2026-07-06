import XCTest

@testable import Houston

/// `SdkClient.purgeUserData()` — the sign-out cache wipe. The scope keys
/// (`agents`, `integrations`) are FIXED, so without a purge a different user
/// signing in on the same device would read the previous user's cached snapshot
/// until a refetch landed. Purge must unload every store's snapshot and close its
/// live bridge subscription.
@MainActor
final class SdkClientPurgeTests: XCTestCase {
  private func makeClient() -> (SdkClient, MockTransport) {
    let transport = MockTransport()
    return (SdkClient(transport: transport), transport)
  }

  private func populate(_ client: SdkClient, _ transport: MockTransport) throws -> (
    ScopeStore<AgentsViewModel>, ScopeRetention, String
  ) {
    let store = client.scope(SdkScope.agents, as: AgentsViewModel.self)
    let token = store.retain()
    let sub = try XCTUnwrap(BridgeTestJSON.sub(from: try XCTUnwrap(transport.delivered.last)))
    client.receiveOutbound(
      BridgeTestJSON.encode(
        .subscribed(
          sub: sub, scope: SdkScope.agents,
          snapshot: .object(["loaded": .bool(true), "items": .array([])]))))
    XCTAssertEqual(store.snapshot?.loaded, true, "precondition: snapshot cached")
    return (store, token, sub)
  }

  func testPurgeUnloadsSnapshotAndUnsubscribes() throws {
    let (client, transport) = makeClient()
    let (store, token, sub) = try populate(client, transport)

    client.purgeUserData()

    XCTAssertNil(store.snapshot, "purge must drop the previous user's snapshot")
    XCTAssertNil(store.lastError)
    XCTAssertTrue(
      transport.delivered.contains {
        BridgeTestJSON.kind(of: $0) == "unsubscribe" && BridgeTestJSON.sub(from: $0) == sub
      },
      "purge must close the live bridge subscription")
    token.cancel()
  }

  func testFreshRetainAfterPurgeReopensSubscription() throws {
    let (client, transport) = makeClient()
    let (store, token, _) = try populate(client, transport)
    token.cancel()  // simulate the signed-in UI tearing down on sign-out

    client.purgeUserData()

    // Same cached store object; a fresh retention must open a NEW subscription
    // (not resurrect the previous user's stream) and stay unloaded until a new
    // snapshot lands.
    let token2 = store.retain()
    let subscribes = transport.delivered.filter { BridgeTestJSON.kind(of: $0) == "subscribe" }
    XCTAssertEqual(subscribes.count, 2, "a fresh retain reopens the subscription")
    XCTAssertNil(store.snapshot, "the new subscription starts unloaded")
    token2.cancel()
  }

  func testPurgeIsIdempotentWithNoSubscriptions() {
    let (client, _) = makeClient()
    // No stores, no subscriptions — must not crash or throw.
    client.purgeUserData()
  }
}

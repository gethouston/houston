import XCTest

@testable import Houston

/// Sign-out must purge the SDK's per-user scope caches. Without it, the fixed
/// scope keys (`agents`, `integrations`) leak the previous user's cached snapshot
/// to the next user who signs in on the same device. This drives the real
/// `AuthController.signOut()` and asserts the cached snapshot is gone afterwards.
@MainActor
final class AuthSignOutPurgeTests: XCTestCase {
  private func config() -> AuthController.Configuration {
    AuthController.Configuration(
      firebaseAPIKey: "test-key",
      gatewayBaseURL: "https://gateway.test",
      googleClientID: "",
      microsoftClientID: "")
  }

  /// A client whose commands (e.g. `session/setToken`) auto-succeed, so
  /// `signOut()` never blocks on the bridge. A short timeout is a safety net.
  private func makeClient() -> (SdkClient, MockTransport) {
    let transport = MockTransport()
    let client = SdkClient(transport: transport, commandTimeout: .milliseconds(200))
    transport.onDeliver = { raw in
      guard let env = BridgeTestJSON.envelope(from: raw) else { return }  // ignore (un)subscribe
      client.receiveOutbound(
        BridgeTestJSON.encode(.result(CommandResult(id: env.id, ok: true, value: nil, error: nil))))
    }
    return (client, transport)
  }

  func testSignOutPurgesScopeSnapshots() async throws {
    let (client, transport) = makeClient()
    let store = client.scope(SdkScope.agents, as: AgentsViewModel.self)
    let token = store.retain()
    let sub = try XCTUnwrap(BridgeTestJSON.sub(from: try XCTUnwrap(transport.delivered.last)))
    client.receiveOutbound(
      BridgeTestJSON.encode(
        .subscribed(
          sub: sub, scope: SdkScope.agents,
          snapshot: .object(["loaded": .bool(true), "items": .array([])]))))
    XCTAssertEqual(store.snapshot?.loaded, true, "precondition: the signed-in user's snapshot")

    let auth = AuthController(config: config(), sdk: client)
    await auth.signOut()

    XCTAssertEqual(auth.state, .signedOut)
    XCTAssertNil(store.snapshot, "sign-out must purge the previous user's scope caches")
    token.cancel()
  }

  func testForceSignOutPurgesScopeSnapshots() async throws {
    let (client, transport) = makeClient()
    let store = client.scope(SdkScope.agents, as: AgentsViewModel.self)
    let token = store.retain()
    let sub = try XCTUnwrap(BridgeTestJSON.sub(from: try XCTUnwrap(transport.delivered.last)))
    client.receiveOutbound(
      BridgeTestJSON.encode(
        .subscribed(
          sub: sub, scope: SdkScope.agents,
          snapshot: .object(["loaded": .bool(true), "items": .array([])]))))
    XCTAssertEqual(store.snapshot?.loaded, true)

    let auth = AuthController(config: config(), sdk: client)
    await auth.forceSignOut()  // the tokenExpired / failed-refresh terminal path
    XCTAssertEqual(auth.state, .signedOut)
    XCTAssertNil(store.snapshot, "the tokenExpired terminal path must purge too")
    token.cancel()
  }
}

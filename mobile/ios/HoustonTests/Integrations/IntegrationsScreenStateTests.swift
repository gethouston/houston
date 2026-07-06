import XCTest

@testable import Houston

/// State-machine tests for the global Integrations surface (PARITY-SETTINGS §3):
/// the `integrations` VM must degrade to the right full-screen state and NEVER
/// leave the tab stuck — loading before the first load, ready when configured,
/// and the unavailable/signin degrade states (landmine 6, a 503 never crashes).
final class IntegrationsScreenStateTests: XCTestCase {
  private func vm(
    loaded: Bool,
    ready: Bool,
    reason: IntegrationsUnavailableReason? = nil
  ) -> IntegrationsViewModel {
    IntegrationsViewModel(
      loaded: loaded, ready: ready, reason: reason, toolkits: [], connections: [])
  }

  func testNilSnapshotIsLoading() {
    XCTAssertEqual(IntegrationsScreenState.derive(from: nil), .loading)
  }

  func testNotLoadedIsLoading() {
    // The SDK publishes {loaded:false, ready:false} as its initial snapshot.
    XCTAssertEqual(IntegrationsScreenState.derive(from: vm(loaded: false, ready: false)), .loading)
  }

  func testReadyWhenConfigured() {
    XCTAssertEqual(IntegrationsScreenState.derive(from: vm(loaded: true, ready: true)), .ready)
  }

  func testUnavailableReason() {
    let state = IntegrationsScreenState.derive(
      from: vm(loaded: true, ready: false, reason: .unavailable))
    XCTAssertEqual(state, .unavailable)
  }

  func testSigninReason() {
    let state = IntegrationsScreenState.derive(
      from: vm(loaded: true, ready: false, reason: .signin))
    XCTAssertEqual(state, .signin)
  }

  func testNotReadyWithNoReasonFallsBackToUnavailable() {
    XCTAssertEqual(
      IntegrationsScreenState.derive(from: vm(loaded: true, ready: false, reason: nil)),
      .unavailable)
  }

  func testNotReadyWithUnknownReasonFallsBackToUnavailable() {
    let state = IntegrationsScreenState.derive(
      from: vm(loaded: true, ready: false, reason: .unknown("future")))
    XCTAssertEqual(state, .unavailable)
  }
}

import XCTest

@testable import Houston

/// Debounced search state machine (PARITY §3): idle / searching / results /
/// empty / failed, and the agent-filter scoping in the command payload.
@MainActor
final class MissionSearchModelTests: XCTestCase {
  private func model(_ stub: MissionCommandRunnerStub, agentFilter: String? = nil) -> MissionSearchModel {
    MissionSearchModel(runner: stub, agentFilter: agentFilter, debounce: .milliseconds(1))
  }

  private func match(_ id: String, matchedIn: String, snippet: String? = nil) -> JSONValue {
    var members: [String: JSONValue] = [
      "agentId": .string("a"), "activityId": .string(id),
      "sessionKey": .string("activity-\(id)"), "title": .string("T\(id)"),
      "matchedIn": .string(matchedIn),
    ]
    if let snippet { members["snippet"] = .string(snippet) }
    return .object(members)
  }

  /// Poll until `predicate` holds or the budget elapses (search runs off a Task).
  private func waitUntil(_ predicate: () -> Bool) async {
    for _ in 0..<200 {
      if predicate() { return }
      try? await Task.sleep(for: .milliseconds(5))
    }
  }

  func testEmptyQueryIsIdle() {
    let m = model(MissionCommandRunnerStub())
    m.query = "   "
    m.queryChanged()
    XCTAssertEqual(m.state, .idle)
    XCTAssertFalse(m.isSearching)
  }

  func testResultsState() async {
    let stub = MissionCommandRunnerStub()
    stub.responses["missions/search"] = .array([match("1", matchedIn: "title")])
    let m = model(stub)
    m.query = "report"
    m.queryChanged()
    await waitUntil { if case .results = m.state { return true }; return false }
    guard case let .results(matches) = m.state else { return XCTFail("expected results") }
    XCTAssertEqual(matches.map(\.activityId), ["1"])
  }

  func testNoMatchesIsEmpty() async {
    let stub = MissionCommandRunnerStub()
    stub.responses["missions/search"] = .array([])
    let m = model(stub)
    m.query = "zzz"
    m.queryChanged()
    await waitUntil { m.state == .empty }
    XCTAssertEqual(m.state, .empty)
  }

  func testFailureIsFailedState() async {
    let stub = MissionCommandRunnerStub()
    stub.failures["missions/search"] = StubError()
    let m = model(stub)
    m.query = "boom"
    m.queryChanged()
    await waitUntil { m.state == .failed }
    XCTAssertEqual(m.state, .failed)
  }

  func testAgentFilterInPayload() async {
    let stub = MissionCommandRunnerStub()
    stub.responses["missions/search"] = .array([])
    let m = model(stub, agentFilter: "agent-7")
    m.query = "x"
    m.queryChanged()
    await waitUntil { m.state == .empty }
    XCTAssertEqual(stub.lastPayload(for: "missions/search")?["agentId"]?.stringValue, "agent-7")
  }
}

import XCTest

@testable import Houston

/// Cross-agent aggregation: columns, filter, archived split, recents order, and
/// the initial landing page (PARITY §1/§2/§6).
final class MissionAggregationTests: XCTestCase {
  private func board() -> [AgentActivities] {
    [
      MissionFixture.entry(
        MissionFixture.agent(id: "a", name: "Ada"),
        [
          MissionFixture.activity(id: "1", status: "running", updatedAt: "2026-07-01T10:00:00Z"),
          MissionFixture.activity(id: "2", status: "needs_you", updatedAt: "2026-07-01T12:00:00Z"),
          MissionFixture.activity(id: "3", status: "archived", updatedAt: "2026-06-30T09:00:00Z"),
        ]
      ),
      MissionFixture.entry(
        MissionFixture.agent(id: "b", name: "Boole"),
        [
          MissionFixture.activity(id: "4", status: "error", updatedAt: "2026-07-02T08:00:00Z"),
          MissionFixture.activity(id: "5", status: "done", updatedAt: "2026-07-01T08:00:00Z"),
        ]
      ),
    ]
  }

  func testColumnsMapStatusesAndFoldErrorIntoNeedsYou() {
    let agents = board()
    XCTAssertEqual(MissionAggregation.missions(in: .running, agents: agents, agentFilter: nil).map(\.activityId), ["1"])
    // error shares the Needs-you column; ordered by updatedAt desc → 4 (07-02) then 2 (07-01).
    XCTAssertEqual(MissionAggregation.missions(in: .needsYou, agents: agents, agentFilter: nil).map(\.activityId), ["4", "2"])
    XCTAssertEqual(MissionAggregation.missions(in: .done, agents: agents, agentFilter: nil).map(\.activityId), ["5"])
  }

  func testArchivedExcludedFromColumnsAndListedSeparately() {
    let agents = board()
    let allColumns = BoardColumn.ordered.flatMap {
      MissionAggregation.missions(in: $0, agents: agents, agentFilter: nil).map(\.activityId)
    }
    XCTAssertFalse(allColumns.contains("3"))
    XCTAssertEqual(MissionAggregation.archived(agents: agents, agentFilter: nil).map(\.activityId), ["3"])
  }

  func testAgentFilterScopesToOneAgent() {
    let agents = board()
    let running = MissionAggregation.missions(in: .running, agents: agents, agentFilter: "b")
    XCTAssertTrue(running.isEmpty)
    let needs = MissionAggregation.missions(in: .needsYou, agents: agents, agentFilter: "b")
    XCTAssertEqual(needs.map(\.activityId), ["4"])
  }

  func testInitialColumnPrefersNeedsYouThenRunning() {
    XCTAssertEqual(MissionAggregation.initialColumn(agents: board(), agentFilter: nil), .needsYou)

    let noNeeds = [MissionFixture.entry(
      MissionFixture.agent(id: "a", name: "Ada"),
      [MissionFixture.activity(id: "1", status: "running")]
    )]
    XCTAssertEqual(MissionAggregation.initialColumn(agents: noNeeds, agentFilter: nil), .running)
  }

  func testFilterAgentsOrdersRecentsFirst() {
    // Boole's latest activity (07-02) beats Ada's (07-01).
    XCTAssertEqual(MissionAggregation.filterAgents(board()).map(\.id), ["b", "a"])
  }

  func testActiveBoardIsEmptyIgnoresArchived() {
    let onlyArchived = [MissionFixture.entry(
      MissionFixture.agent(id: "a", name: "Ada"),
      [MissionFixture.activity(id: "1", status: "archived")]
    )]
    XCTAssertTrue(MissionAggregation.activeBoardIsEmpty(agents: onlyArchived, agentFilter: nil))
  }
}

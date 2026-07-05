import XCTest
@testable import Houston

/// Verifies the per-agent missions grouping (PARITY §1/§2): the section order
/// (Needs you, Running, Done), `error` folding into Needs you, `cancelled`
/// folding into Done, `archived` excluded from sections but counted, empty
/// groups omitted, and within-section recency ordering.
final class AgentMissionsGroupingTests: XCTestCase {
    private let agent = MissionFixture.agent(id: "a", name: "Agent")

    private func group(_ activities: [ActivityItem]) -> AgentMissionsGrouping {
        AgentMissionsGrouper.make(agent: agent, activities: activities)
    }

    func testSectionOrderIsNeedsYouRunningDone() {
        let g = group([
            MissionFixture.activity(id: "d", status: "done"),
            MissionFixture.activity(id: "r", status: "running"),
            MissionFixture.activity(id: "n", status: "needs_you"),
        ])
        XCTAssertEqual(g.sections.map(\.column), [.needsYou, .running, .done])
    }

    func testErrorFoldsIntoNeedsYouSection() {
        let g = group([
            MissionFixture.activity(id: "n", status: "needs_you"),
            MissionFixture.activity(id: "e", status: "error"),
        ])
        XCTAssertEqual(g.sections.count, 1)
        XCTAssertEqual(g.sections[0].column, .needsYou)
        XCTAssertEqual(Set(g.sections[0].cards.map(\.activityId)), ["n", "e"])
    }

    func testCancelledFoldsIntoDone() {
        let g = group([
            MissionFixture.activity(id: "c", status: "cancelled"),
            MissionFixture.activity(id: "d", status: "done"),
        ])
        XCTAssertEqual(g.sections.map(\.column), [.done])
        XCTAssertEqual(Set(g.sections[0].cards.map(\.activityId)), ["c", "d"])
    }

    func testArchivedExcludedFromSectionsButCounted() {
        let g = group([
            MissionFixture.activity(id: "n", status: "needs_you"),
            MissionFixture.activity(id: "a1", status: "archived"),
            MissionFixture.activity(id: "a2", status: "archived"),
        ])
        XCTAssertEqual(g.sections.map(\.column), [.needsYou])
        XCTAssertEqual(g.archivedCount, 2)
        XCTAssertFalse(g.isEmpty)
    }

    func testEmptyWhenOnlyArchivedOrNothing() {
        XCTAssertTrue(group([]).isEmpty)
        let onlyArchived = group([MissionFixture.activity(id: "a", status: "archived")])
        XCTAssertTrue(onlyArchived.isEmpty)
        XCTAssertEqual(onlyArchived.archivedCount, 1)
    }

    func testHasRunningReflectsRunningPresence() {
        XCTAssertTrue(group([MissionFixture.activity(id: "r", status: "running")]).hasRunning)
        XCTAssertFalse(group([MissionFixture.activity(id: "n", status: "needs_you")]).hasRunning)
    }

    func testWithinSectionSortedMostRecentFirst() {
        let g = group([
            MissionFixture.activity(id: "older", status: "running", updatedAt: "2026-07-01T00:00:00Z"),
            MissionFixture.activity(id: "newer", status: "running", updatedAt: "2026-07-09T00:00:00Z"),
        ])
        XCTAssertEqual(g.sections.map(\.column), [.running])
        XCTAssertEqual(g.sections[0].cards.map(\.activityId), ["newer", "older"])
    }

    func testUnknownStatusIsOffBoardAndNotArchived() {
        let g = group([MissionFixture.activity(id: "u", status: "weird_new_status")])
        XCTAssertTrue(g.isEmpty)
        XCTAssertEqual(g.archivedCount, 0)
    }
}

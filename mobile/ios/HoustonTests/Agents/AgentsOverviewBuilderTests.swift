import XCTest
@testable import Houston

/// Verifies the Agents-tab aggregation: desktop-exact status counts, most-recent
/// active mission selection, and the attention sort (PARITY §4). Exercises the
/// real `build([AgentActivities])` seam input (the shape `AgentsOverviewModel`
/// publishes), built via `MissionFixture`.
final class AgentsOverviewBuilderTests: XCTestCase {
    /// Convenience: one agent's entry from `(id, [activity])`.
    private func entry(_ id: String, name: String = "Agent", _ activities: [ActivityItem]) -> AgentActivities {
        MissionFixture.entry(MissionFixture.agent(id: id, name: name), activities)
    }

    func testSummaryCountsNeedsYouAndRunningOnly() {
        // error, done and archived must NOT contribute to the counts (mirrors
        // desktop's buildAgentActivitySummaries — only needs_you + running).
        let items = [
            MissionFixture.activity(id: "1", status: "needs_you"),
            MissionFixture.activity(id: "2", status: "running"),
            MissionFixture.activity(id: "3", status: "error"),
            MissionFixture.activity(id: "4", status: "done"),
            MissionFixture.activity(id: "5", status: "archived"),
        ]
        let out = AgentsOverviewBuilder.build([entry("a", items)])

        XCTAssertEqual(out.count, 1)
        XCTAssertEqual(out[0].summary.needsYouCount, 1)
        XCTAssertEqual(out[0].summary.runningCount, 1)
        XCTAssertTrue(out[0].isRunning)
    }

    func testLastActivityPicksMostRecentNonArchived() {
        let items = [
            MissionFixture.activity(id: "old", title: "Old", status: "done",
                                    updatedAt: "2026-07-01T10:00:00Z"),
            MissionFixture.activity(id: "new", title: "New", status: "needs_you",
                                    updatedAt: "2026-07-02T10:00:00Z"),
            // An archived mission is newer but must be ignored (PARITY §2).
            MissionFixture.activity(id: "arch", title: "Arch", status: "archived",
                                    updatedAt: "2026-07-03T10:00:00Z"),
        ]
        let out = AgentsOverviewBuilder.build([entry("a", items)])

        XCTAssertEqual(out[0].lastActivity?.title, "New")
        XCTAssertEqual(out[0].lastActivity?.state, .needsYou)
    }

    func testEmptyAgentHasNoLastActivity() {
        let out = AgentsOverviewBuilder.build([entry("a", [])])
        XCTAssertNil(out[0].lastActivity)
        XCTAssertNil(out[0].lastActivityAt)
        XCTAssertEqual(out[0].needsYouCount, 0)
        XCTAssertFalse(out[0].isRunning)
    }

    func testLastActivityAtReflectsMostRecentMissionTimestamp() {
        // The Date behind the WA row time label parses the picked mission's ISO
        // `updatedAt` (the most-recent non-archived one — the "New" mission here).
        let items = [
            MissionFixture.activity(id: "old", title: "Old", status: "done",
                                    updatedAt: "2026-07-01T10:00:00Z"),
            MissionFixture.activity(id: "new", title: "New", status: "needs_you",
                                    updatedAt: "2026-07-02T10:00:00Z"),
        ]
        let out = AgentsOverviewBuilder.build([entry("a", items)])
        XCTAssertEqual(out[0].lastActivityAt, ActivityTimestamp.date(from: "2026-07-02T10:00:00Z"))
    }

    func testAttentionSortNeedsYouThenRunningThenRecency() {
        let out = AgentsOverviewBuilder.build([
            entry("old", name: "Old", [
                MissionFixture.activity(id: "d2", status: "done", updatedAt: "2026-07-02T00:00:00Z"),
            ]),
            entry("running", name: "Running", [
                MissionFixture.activity(id: "r", status: "running", updatedAt: "2026-07-01T00:00:00Z"),
            ]),
            entry("recent", name: "Recent", [
                MissionFixture.activity(id: "d1", status: "done", updatedAt: "2026-07-05T00:00:00Z"),
            ]),
            entry("needs", name: "Needs", [
                MissionFixture.activity(id: "n", status: "needs_you", updatedAt: "2026-07-01T00:00:00Z"),
            ]),
        ])

        // needs-you first, then running, then the two idle agents by recency.
        XCTAssertEqual(out.map(\.id), ["needs", "running", "recent", "old"])
    }

    func testNeedsYouAgentSortsAheadEvenWithOlderActivity() {
        // Attention beats recency: a needs-you agent with an OLD timestamp still
        // outranks a purely-idle agent with a newer one.
        let out = AgentsOverviewBuilder.build([
            entry("idleNew", name: "IdleNew", [
                MissionFixture.activity(id: "d", status: "done", updatedAt: "2026-07-09T00:00:00Z"),
            ]),
            entry("needsOld", name: "NeedsOld", [
                MissionFixture.activity(id: "n", status: "needs_you", updatedAt: "2026-07-01T00:00:00Z"),
            ]),
        ])
        XCTAssertEqual(out.map(\.id), ["needsOld", "idleNew"])
    }
}

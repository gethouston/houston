import XCTest
@testable import Houston

/// The needs_you-vs-error matrix from PARITY §1 — the single most load-bearing
/// rule in the mobile client. If any of these flips, a normal user Stop renders
/// as a red error (or a real failure hides as "needs you").
final class MissionStateTests: XCTestCase {

    // MARK: THE pair rule (vm-output.ts:36-47, PARITY §1)

    func testUserStopSettlesAsNeedsYou_notError() {
        // A Stop settles sessionStatus == .error BUT boardStatus == .needsYou.
        let state = MissionState.from(sessionStatus: .error, boardStatus: .needsYou)
        XCTAssertEqual(state, .needsYou)
    }

    func testGenuineErrorStaysError() {
        let state = MissionState.from(sessionStatus: .error, boardStatus: .error)
        XCTAssertEqual(state, .error)
    }

    func testNormalCompletionIsNeedsYou() {
        let state = MissionState.from(sessionStatus: .completed, boardStatus: .needsYou)
        XCTAssertEqual(state, .needsYou)
    }

    // MARK: Live turn dominates a stale board status

    func testActiveRunningOverridesStaleNeedsYou() {
        let state = MissionState.from(sessionStatus: .running, boardStatus: .needsYou)
        XCTAssertEqual(state, .running)
    }

    func testActiveRunningOverridesStaleError() {
        let state = MissionState.from(sessionStatus: .running, boardStatus: .error)
        XCTAssertEqual(state, .running)
    }

    func testStartingIsRunning() {
        XCTAssertEqual(MissionState.from(sessionStatus: .starting, boardStatus: nil), .running)
    }

    // MARK: Board status governs once settled

    func testBoardRunningWhileSettledSession() {
        XCTAssertEqual(MissionState.from(sessionStatus: .completed, boardStatus: .running), .running)
    }

    func testUnknownBoardStatusPreserved() {
        XCTAssertEqual(
            MissionState.from(sessionStatus: .completed, boardStatus: .unknown("queued")),
            .unknown("queued")
        )
    }

    // MARK: No board status recorded — derive from the settle

    func testCompletedWithoutBoardIsNeedsYou() {
        XCTAssertEqual(MissionState.from(sessionStatus: .completed, boardStatus: nil), .needsYou)
    }

    func testErrorWithoutBoardIsError() {
        XCTAssertEqual(MissionState.from(sessionStatus: .error, boardStatus: nil), .error)
    }

    func testIdleWithoutBoardIsRunningOptimistically() {
        XCTAssertEqual(MissionState.from(sessionStatus: .idle, boardStatus: nil), .running)
        XCTAssertEqual(MissionState.from(sessionStatus: nil, boardStatus: nil), .running)
    }

    func testUnknownSessionWithoutBoardPreserved() {
        XCTAssertEqual(
            MissionState.from(sessionStatus: .unknown("weird"), boardStatus: nil),
            .unknown("weird")
        )
    }

    // MARK: Activity-status mapping (PARITY §1 canonical wire statuses)

    func testActivityStatusMapping() {
        XCTAssertEqual(MissionState.from(activityStatus: "running"), .running)
        XCTAssertEqual(MissionState.from(activityStatus: "needs_you"), .needsYou)
        XCTAssertEqual(MissionState.from(activityStatus: "done"), .done)
        XCTAssertEqual(MissionState.from(activityStatus: "error"), .error)
        XCTAssertEqual(MissionState.from(activityStatus: "archived"), .archived)
    }

    func testCancelledFoldsIntoDone() {
        XCTAssertEqual(MissionState.from(activityStatus: "cancelled"), .done)
    }

    func testUnknownActivityStatusPreserved() {
        XCTAssertEqual(MissionState.from(activityStatus: "snoozed"), .unknown("snoozed"))
    }

    // MARK: Column mapping (three columns; error shares the Needs-you column)

    func testColumnMapping() {
        XCTAssertEqual(MissionState.running.column, .running)
        XCTAssertEqual(MissionState.needsYou.column, .needsYou)
        XCTAssertEqual(MissionState.error.column, .needsYou)   // error lives in Needs-you column
        XCTAssertEqual(MissionState.done.column, .done)
        XCTAssertNil(MissionState.archived.column)             // off the active board
        XCTAssertNil(MissionState.unknown("x").column)
    }

    func testColumnOrderIsRunningNeedsYouDone() {
        XCTAssertEqual(BoardColumn.ordered, [.running, .needsYou, .done])
    }

    func testColumnLabels() {
        XCTAssertEqual(BoardColumn.running.label, "Running")
        XCTAssertEqual(BoardColumn.needsYou.label, "Needs you")
        XCTAssertEqual(BoardColumn.done.label, "Done")
    }

    // MARK: Raw string parsing round-trips

    func testSessionStatusParsing() {
        XCTAssertEqual(SessionStatus(raw: "running"), .running)
        XCTAssertEqual(SessionStatus(raw: "completed"), .completed)
        XCTAssertEqual(SessionStatus(raw: "idle"), .idle)
        XCTAssertEqual(SessionStatus(raw: "mystery"), .unknown("mystery"))
        XCTAssertTrue(SessionStatus.running.isActive)
        XCTAssertTrue(SessionStatus.starting.isActive)
        XCTAssertFalse(SessionStatus.completed.isActive)
    }

    func testBoardStatusParsing() {
        XCTAssertEqual(BoardStatus(raw: "needs_you"), .needsYou)
        XCTAssertEqual(BoardStatus(raw: "error"), .error)
        XCTAssertEqual(BoardStatus(raw: "running"), .running)
        XCTAssertEqual(BoardStatus(raw: "other"), .unknown("other"))
    }

    // MARK: Count-cap helper (NeedsYouChip caps at 99+)

    func testCountCap() {
        XCTAssertEqual(Strings.cappedCount(5), "5")
        XCTAssertEqual(Strings.cappedCount(99), "99")
        XCTAssertEqual(Strings.cappedCount(100), "99+")
        XCTAssertEqual(Strings.cappedCount(4000), "99+")
    }
}

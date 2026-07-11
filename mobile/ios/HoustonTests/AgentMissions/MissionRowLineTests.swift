import XCTest
@testable import Houston

/// Verifies the slim per-agent mission row's pure content derivation
/// (``MissionRowLine``): the state-driven second line (running → accent
/// "working…", error → destructive snag, else the muted description preview or a
/// collapsed one-line row), title passthrough, and the relative-time label.
final class MissionRowLineTests: XCTestCase {
    private let agent = MissionFixture.agent(id: "a", name: "Agent")

    private func line(
        status: String,
        title: String = "Draft the quarterly report",
        description: String? = nil,
        updatedAt: String? = nil,
        now: Date = Date()
    ) -> MissionRowLine {
        let card = MissionCardData.make(
            agent: agent,
            activity: MissionFixture.activity(
                id: "m", title: title, status: status,
                description: description, updatedAt: updatedAt
            )
        )
        return MissionRowLine.derive(card, now: now)
    }

    // MARK: Title + time

    func testTitleIsPassedThrough() {
        XCTAssertEqual(line(status: "needs_you", title: "Pay the invoices").title, "Pay the invoices")
    }

    func testTimeIsRelativeLabelWhenParseable() {
        let now = ISO8601DateFormatter().date(from: "2026-07-09T00:00:00Z")!
        XCTAssertNotNil(line(status: "done", updatedAt: "2026-07-08T00:00:00Z", now: now).time)
    }

    func testTimeIsNilWhenAbsentOrUnparseable() {
        XCTAssertNil(line(status: "done", updatedAt: nil).time)
        XCTAssertNil(line(status: "done", updatedAt: "not-a-date").time)
    }

    // MARK: Second line by state

    func testRunningShowsWorkingSignal() {
        let l = line(status: "running", description: "some progress")
        XCTAssertEqual(l.secondLine, .working)
        XCTAssertEqual(l.secondLine.text, Strings.Chat.TitleBar.working)
    }

    func testErrorShowsSnagPhrasing() {
        let l = line(status: "error", description: "some progress")
        XCTAssertEqual(l.secondLine, .snag)
        XCTAssertEqual(l.secondLine.text, Strings.AgentMissions.snag)
    }

    func testNeedsYouWithDescriptionShowsPlainPreview() {
        let l = line(status: "needs_you", description: "Confirm the vendor list")
        XCTAssertEqual(l.secondLine, .description("Confirm the vendor list"))
        XCTAssertEqual(l.secondLine.text, "Confirm the vendor list")
    }

    func testNeedsYouWithoutDescriptionCollapsesToOneLine() {
        let l = line(status: "needs_you", description: nil)
        XCTAssertEqual(l.secondLine, .none)
        XCTAssertNil(l.secondLine.text)
    }

    func testDoneWithDescriptionShowsPlainPreview() {
        XCTAssertEqual(line(status: "done", description: "Sent the summary").secondLine,
                       .description("Sent the summary"))
    }

    func testDoneWithoutDescriptionCollapsesToOneLine() {
        XCTAssertEqual(line(status: "done", description: nil).secondLine, .none)
    }

    func testArchivedWithDescriptionShowsPlainPreview() {
        XCTAssertEqual(line(status: "archived", description: "Old draft").secondLine,
                       .description("Old draft"))
    }

    // MARK: Precedence — running / error win over any description

    func testRunningOverridesDescription() {
        XCTAssertEqual(line(status: "running", description: "half done").secondLine, .working)
    }

    func testErrorOverridesDescription() {
        XCTAssertEqual(line(status: "error", description: "half done").secondLine, .snag)
    }
}

import XCTest

@testable import Houston

/// The bug-report composition (PARITY-SETTINGS §1: message + recent logs). The
/// compose step is pure, so it is unit-tested; the `os_log` read is not.
final class BugReportTests: XCTestCase {
    func testComposeIncludesMessageAndLogsUnderDivider() {
        let report = BugReport.compose(message: "It froze on send", logs: "line-a\nline-b")
        XCTAssertTrue(report.hasPrefix("It froze on send"))
        XCTAssertTrue(report.contains("--- recent logs"))
        XCTAssertTrue(report.contains("line-a"))
        XCTAssertTrue(report.contains("line-b"))
    }

    func testEmptyMessageGetsPlaceholderButKeepsLogs() {
        let report = BugReport.compose(message: "   \n ", logs: "diagnostic")
        XCTAssertTrue(report.contains("(no description provided)"))
        XCTAssertTrue(report.contains("diagnostic"))
    }

    func testMessageIsTrimmed() {
        let report = BugReport.compose(message: "  hi  ", logs: "x")
        XCTAssertTrue(report.hasPrefix("hi\n"))
    }
}

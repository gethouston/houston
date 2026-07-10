import XCTest
@testable import Houston

/// Verifies the Agents-tab pull-down search filter: empty/whitespace query is a
/// pass-through, matching is case- and diacritic-insensitive substring on the
/// name, order is preserved, and no match yields an empty list (which drives the
/// "No results" empty state).
final class AgentSearchTests: XCTestCase {
    /// A minimal overview with just an id + name — the only fields search reads.
    private func overview(_ id: String, _ name: String) -> AgentOverview {
        AgentOverview(id: id, name: name, colorHex: nil,
                      summary: AgentActivitySummary(), lastActivity: nil)
    }

    private lazy var rows = [
        overview("a", "Atlas"),
        overview("b", "Beacon"),
        overview("c", "José"),
        overview("d", "atlas junior"),
    ]

    func testEmptyQueryReturnsAllRowsInOrder() {
        XCTAssertEqual(AgentSearch.filter(rows: rows, query: "").map(\.id),
                       ["a", "b", "c", "d"])
    }

    func testWhitespaceOnlyQueryReturnsAllRows() {
        XCTAssertEqual(AgentSearch.filter(rows: rows, query: "   ").map(\.id),
                       ["a", "b", "c", "d"])
    }

    func testCaseInsensitiveMatch() {
        // Lowercase "atlas" matches both "Atlas" and "atlas junior", order kept.
        XCTAssertEqual(AgentSearch.filter(rows: rows, query: "atlas").map(\.id),
                       ["a", "d"])
    }

    func testDiacriticInsensitiveMatch() {
        // Plain "jose" matches "José".
        XCTAssertEqual(AgentSearch.filter(rows: rows, query: "jose").map(\.id),
                       ["c"])
    }

    func testSubstringMatch() {
        // A substring anywhere in the name matches (not just a prefix).
        XCTAssertEqual(AgentSearch.filter(rows: rows, query: "eac").map(\.id),
                       ["b"])
    }

    func testNoMatchReturnsEmpty() {
        XCTAssertTrue(AgentSearch.filter(rows: rows, query: "zzz").isEmpty)
    }

    func testQueryIsTrimmedBeforeMatching() {
        // Surrounding whitespace must not defeat an otherwise-good match.
        XCTAssertEqual(AgentSearch.filter(rows: rows, query: "  Beacon  ").map(\.id),
                       ["b"])
    }
}

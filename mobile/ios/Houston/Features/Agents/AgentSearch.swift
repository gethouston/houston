import Foundation

/// Pure filtering for the Agents-tab pull-down search (WA/Telegram convention).
/// Logic only (no SwiftUI) so it unit-tests directly — the view binds the query
/// and renders the result. Matching is case- and diacritic-insensitive on the
/// agent name via `localizedStandardContains` (the same comparison Finder/Files
/// use), and an empty (or whitespace-only) query returns every row unchanged so
/// the search field revealing on pull-down never hides anyone.
enum AgentSearch {
    /// The rows to show for `query`: all of `rows` when the query is blank,
    /// otherwise the rows whose name contains it (case/diacritic-insensitive).
    /// Order is preserved from the input (the attention sort upstream).
    static func filter(rows: [AgentOverview], query: String) -> [AgentOverview] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return rows }
        return rows.filter { $0.name.localizedStandardContains(trimmed) }
    }
}

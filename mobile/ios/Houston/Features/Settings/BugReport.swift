import Foundation
import OSLog

/// Builds a bug report: the user's message plus a tail of the app's recent
/// `os_log` output (PARITY-SETTINGS §1 Report bug: "message + recent logs").
///
/// DEVIATION (honest, flagged): the desktop POSTs the report to a bug endpoint,
/// but the iOS SDK surface exposes no bug-submit command, so the phone hands the
/// composed text to the system share sheet instead — the user sends it via mail
/// or their app of choice. When a submit command exists, swap the share sheet
/// for it; the compose logic here is unchanged.
enum BugReport {
    /// The Houston subsystems whose log lines we include (the app + the SDK
    /// bridge + scopes — see the `Logger(subsystem:)` calls across the app).
    static let subsystemPrefix = "ai.gethouston"

    /// How far back and how many lines to gather. The desktop sends "the logs
    /// from your last activity", so a short recent tail is the right analogue.
    static let lookback: TimeInterval = 15 * 60
    static let maxLines = 200

    /// Read the recent Houston `os_log` tail for this process, newest-bounded.
    /// Best-effort: if the log store is unavailable it returns a short marker
    /// rather than throwing — a report without logs still beats no report.
    static func recentLogs(
        since: TimeInterval = lookback,
        limit: Int = maxLines,
        now: Date = Date()
    ) -> String {
        do {
            let store = try OSLogStore(scope: .currentProcessIdentifier)
            let position = store.position(date: now.addingTimeInterval(-since))
            let lines = try store.getEntries(at: position)
                .compactMap { $0 as? OSLogEntryLog }
                .filter { $0.subsystem.hasPrefix(subsystemPrefix) }
                .map { "[\($0.subsystem)/\($0.category)] \($0.composedMessage)" }
                .suffix(limit)
            return lines.isEmpty ? "(no recent Houston logs)" : lines.joined(separator: "\n")
        } catch {
            return "(logs unavailable: \(error.localizedDescription))"
        }
    }

    /// Compose the full report text. Pure (no I/O), so it is unit-tested: the
    /// user's message on top, then the log tail under a labeled divider. An empty
    /// message still produces a valid report (the logs alone are useful).
    static func compose(message: String, logs: String) -> String {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = trimmed.isEmpty ? "(no description provided)" : trimmed
        return """
        \(body)

        --- recent logs (\(AppVersion.footer)) ---
        \(logs)
        """
    }
}

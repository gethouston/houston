import Foundation

/// The per-agent contact-row view-model for the Agents tab, plus the pure builder
/// + attention sort that produce it from the shared `AgentActivities` seam.
/// Logic only (no SwiftUI) so it unit-tests directly. Mirrors desktop's
/// `buildAgentActivitySummaries` (`app/src/components/shell/
/// agent-activity-summary-model.ts`) and the attention ordering decided for the
/// mobile IA (PARITY §4).

/// Counts of an agent's missions by status. Mirrors desktop's summary model
/// EXACTLY: only `needs_you` and `running` are counted (`error` shares the
/// Needs-you column in the missions view but is NOT part of the attention count,
/// matching desktop — PARITY §4).
struct AgentActivitySummary: Equatable, Sendable {
    var needsYouCount: Int = 0
    var runningCount: Int = 0
}

/// The most recent active (non-archived) mission for an agent — the source of the
/// contact row's product-voice last-activity line.
struct LastActivity: Equatable, Sendable {
    let title: String
    let state: MissionState
    /// ISO timestamp; used only for recency ordering (lexicographic on ISO 8601).
    let updatedAt: String?
}

/// One agent as a contact: identity, attention counts, running flag, and the
/// most-recent-mission line. `colorHex` is `nil` today — the SDK `agents` scope
/// carries no cosmetic colour (PARITY §4 fallback is Houston gray).
struct AgentOverview: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let colorHex: String?
    let summary: AgentActivitySummary
    let lastActivity: LastActivity?

    /// Running-glow rule (PARITY §4): the avatar glows when the agent has any
    /// running mission.
    var isRunning: Bool { summary.runningCount > 0 }
    /// Attention rule (PARITY §4): show the outline count chip when > 0.
    var needsYouCount: Int { summary.needsYouCount }
}

enum AgentsOverviewBuilder {
    /// Build the ordered contact list from the shared cross-agent overview
    /// (`AgentActivities` per agent). Archived missions are excluded from both the
    /// counts and the last-activity line (they live only in the Archived view,
    /// PARITY §2).
    static func build(_ entries: [AgentActivities]) -> [AgentOverview] {
        entries.map(overview(for:)).sorted(by: attentionOrder)
    }

    private static func overview(for entry: AgentActivities) -> AgentOverview {
        let active = entry.activities.filter { $0.status != .archived }
        var summary = AgentActivitySummary()
        for item in active {
            switch item.status {
            case .needsYou: summary.needsYouCount += 1
            case .running: summary.runningCount += 1
            default: break
            }
        }
        return AgentOverview(
            id: entry.agent.id,
            name: entry.agent.name,
            colorHex: nil,
            summary: summary,
            lastActivity: mostRecent(active)
        )
    }

    /// The most recent active mission by `updatedAt` (ISO strings sort
    /// chronologically). `nil` when the agent has no active mission.
    private static func mostRecent(_ items: [ActivityItem]) -> LastActivity? {
        guard let latest = items.max(by: { ($0.updatedAt ?? "") < ($1.updatedAt ?? "") })
        else { return nil }
        return LastActivity(
            title: latest.title,
            state: MissionState.from(activityStatus: latest.status.raw),
            updatedAt: latest.updatedAt
        )
    }

    /// Attention sort (PARITY §4, mobile IA): needs-you agents first, then running
    /// agents, then everyone else — each tier ordered by most-recent activity.
    static func attentionOrder(_ a: AgentOverview, _ b: AgentOverview) -> Bool {
        let ra = tier(a), rb = tier(b)
        if ra != rb { return ra < rb }
        return (a.lastActivity?.updatedAt ?? "") > (b.lastActivity?.updatedAt ?? "")
    }

    /// 0 = has needs-you, 1 = has running (no needs-you), 2 = idle.
    private static func tier(_ o: AgentOverview) -> Int {
        if o.summary.needsYouCount > 0 { return 0 }
        if o.summary.runningCount > 0 { return 1 }
        return 2
    }
}

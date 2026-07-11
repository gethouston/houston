import Foundation

/// One grouped section on the per-agent missions screen — a board column and its
/// mission cards, most-recent first.
struct AgentMissionSection: Identifiable, Equatable, Sendable {
    let column: BoardColumn
    let cards: [MissionCardData]
    var id: String { column.id }
}

/// The per-agent missions screen's grouped model: the non-empty sections in
/// PARITY order plus the archived count for the bottom "Archived" row.
struct AgentMissionsGrouping: Equatable, Sendable {
    let sections: [AgentMissionSection]
    let archivedCount: Int

    /// True when there are no active missions in any section (drives the
    /// board-empty state; the archived count is considered separately).
    var isEmpty: Bool { sections.isEmpty }
}

/// Pure grouping for the per-agent missions screen — no SwiftUI, so it unit-tests
/// directly. Buckets one agent's activities into the PARITY groups: **Needs you**
/// (incl. `error`), **Running** (in progress), **Done** (incl. the `cancelled`
/// alias), with `archived` excluded from the sections and only counted for the
/// Archived row (PARITY §1/§2). Column membership + status resolution come from
/// the shared ``MissionState`` so this stays in lockstep with Mission Control.
enum AgentMissionsGrouper {
    /// Per-agent group order (PARITY): Needs you, then In progress, then Done.
    /// This deliberately leads with attention items, unlike the desktop board's
    /// left-to-right column order (`BoardColumn.ordered`).
    static let order: [BoardColumn] = [.needsYou, .running, .done]

    static func make(agent: AgentListItem, activities: [ActivityItem]) -> AgentMissionsGrouping {
        let cards = activities.map { MissionCardData.make(agent: agent, activity: $0) }
        let sections = order.compactMap { column -> AgentMissionSection? in
            let inColumn = cards
                .filter { $0.state.column == column }
                .sorted { ($0.updatedAt ?? "") > ($1.updatedAt ?? "") }
            return inColumn.isEmpty ? nil : AgentMissionSection(column: column, cards: inColumn)
        }
        let archivedCount = cards.filter { $0.state == .archived }.count
        return AgentMissionsGrouping(sections: sections, archivedCount: archivedCount)
    }
}

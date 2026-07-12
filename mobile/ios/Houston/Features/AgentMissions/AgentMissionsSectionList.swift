import SwiftUI

/// The grouped list body of the per-agent missions screen: one `Section` per
/// non-empty group in PARITY order (Needs you, Running, Done), each holding its
/// ``AgentMissionRow``s, with a trailing "Archived" row that pushes the agent's
/// archived list (PARITY §2). Section headers reuse the desktop-exact column
/// labels (`BoardColumn.label`). Actions bubble up to the owning view, which runs
/// them through `MissionActions` and shows the confirm/rename dialogs.
struct AgentMissionsSectionList: View {
    @Environment(\.theme) private var theme
    let grouping: AgentMissionsGrouping
    let onOpen: (ChatRoute) -> Void
    let onOpenArchived: () -> Void
    let onRename: (MissionCardData) -> Void
    let onArchive: (MissionCardData) -> Void
    let onDelete: (MissionCardData) -> Void

    var body: some View {
        List {
            ForEach(grouping.sections) { section in
                Section {
                    ForEach(section.cards) { card in
                        AgentMissionRow(
                            card: card, onOpen: onOpen,
                            onRename: onRename, onArchive: onArchive, onDelete: onDelete
                        )
                    }
                } header: {
                    Text(section.column.label)
                        .font(Typography.captionStrong)
                        .foregroundStyle(theme.inkMuted)
                        .textCase(.uppercase)
                }
            }
            archivedRow
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    /// The bottom entry into the agent's Archived list (PARITY §2). Always shown
    /// (even at zero) for discoverability; the count is rendered only when > 0.
    private var archivedRow: some View {
        Button { onOpenArchived() } label: {
            HStack(spacing: Spacing.space8) {
                Label(Strings.Board.archived, systemImage: "archivebox")
                    .font(Typography.bodyMedium)
                    .foregroundStyle(theme.ink)
                Spacer(minLength: Spacing.space8)
                if grouping.archivedCount > 0 {
                    Text("\(grouping.archivedCount)")
                        .font(Typography.callout)
                        .foregroundStyle(theme.inkMuted)
                }
                Image(systemName: "chevron.right")
                    .font(Typography.caption)
                    .foregroundStyle(theme.inkMuted)
            }
        }
        .buttonStyle(.plain)
        .listRowInsets(EdgeInsets(top: Spacing.space12, leading: Spacing.space16,
                                  bottom: Spacing.space12, trailing: Spacing.space16))
    }
}

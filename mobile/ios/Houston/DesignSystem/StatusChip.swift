import SwiftUI

/// A small status pill for a mission's resolved `MissionState`. The label is the
/// board-column label (PARITY §1): `error` shares the "Needs you" column label
/// but is tinted destructive, so the needs_you-vs-error distinction stays visible.
struct StatusChip: View {
    @Environment(\.theme) private var theme
    let state: MissionState

    var body: some View {
        HStack(spacing: Spacing.space6) {
            Circle()
                .fill(dotColor)
                .frame(width: 6, height: 6)
            Text(label)
                .font(Typography.label)
                .foregroundStyle(theme.ink)
        }
        .padding(.horizontal, Spacing.space8)
        .padding(.vertical, Spacing.space4)
        .background(theme.chipSubtle, in: Capsule())
        .overlay(Capsule().strokeBorder(theme.line, lineWidth: 1))
    }

    private var label: String {
        switch state {
        case .running: return Strings.Board.columnRunning
        case .needsYou, .error: return Strings.Board.columnNeedsYou
        case .done: return Strings.Board.columnDone
        case .archived: return Strings.Board.archived
        case .unknown(let raw): return raw
        }
    }

    private var dotColor: Color {
        switch state {
        case .running: return GlowColor.running
        case .needsYou: return theme.warning
        case .error: return theme.danger
        case .done: return theme.success
        case .archived, .unknown: return theme.inkMuted
        }
    }
}

/// Attention badge: the per-agent needs-you count, capped at "99+" (PARITY §4).
/// Rendered when `needsYouCount > 0` on an agent avatar/row — the WhatsApp-style
/// filled capsule (warning fill, on-warning text), the unread-count look on the
/// Agents home.
struct NeedsYouChip: View {
    @Environment(\.theme) private var theme
    let count: Int

    var body: some View {
        Text(Strings.cappedCount(count))
            .font(Typography.captionStrong)
            .foregroundStyle(theme.warningText)
            .padding(.horizontal, Spacing.space6)
            .padding(.vertical, Spacing.space2)
            .background(Capsule().fill(theme.warning))
            .accessibilityLabel(Strings.Shell.needsYouCount(count))
    }
}

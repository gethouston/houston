import SwiftUI

/// The visual of one slim mission row — the sober WhatsApp-style conversation
/// line. Line 1: the mission title with a right-aligned relative time. Line 2: a
/// state-aware signal (accent "working…", destructive snag, or a muted
/// description preview) that collapses away when empty. NO avatar, NO agent name,
/// NO tags, NO card border/fill/glow — the enclosing `List` supplies the inset
/// hairline separators and the row keeps a ~44pt tap target even when it collapses
/// to one line. Content is precomputed by the pure ``MissionRowLine``; this view
/// only maps the second-line case to its tint role.
struct MissionRowContent: View {
    @Environment(\.theme) private var theme
    let line: MissionRowLine

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.space2) {
            HStack(alignment: .firstTextBaseline, spacing: Spacing.space8) {
                Text(line.title)
                    .font(Typography.bodyMedium)
                    .foregroundStyle(theme.ink)
                    .lineLimit(1)
                Spacer(minLength: Spacing.space8)
                if let time = line.time {
                    Text(time)
                        .font(Typography.caption)
                        .foregroundStyle(theme.inkMuted)
                        .lineLimit(1)
                }
            }
            if let text = line.secondLine.text {
                Text(text)
                    .font(Typography.callout)
                    .foregroundStyle(secondLineColor)
                    .lineLimit(1)
            }
        }
        // Content min-height + the row's vertical insets keep a ~44pt tap target
        // even when the second line is absent (collapsed one-line row).
        .frame(minHeight: Spacing.space24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var secondLineColor: Color {
        switch line.secondLine {
        // Working reads inkMuted like the chat title bar; the old accent role
        // became the opaque hover fill in the token rename and is not for text.
        case .working: return theme.inkMuted
        case .snag: return theme.danger
        case .description, .none: return theme.inkMuted
        }
    }
}

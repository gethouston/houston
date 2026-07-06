import SwiftUI

/// Shared row + chrome pieces for the Settings list. Every colour/spacing/type
/// value comes from the design system (Theme / Spacing / Typography) — no raw
/// literals in a feature (client-architecture.md invariant 2).

/// A themed grouped-list section header, matching the desktop's muted uppercase
/// group labels.
struct SettingsSectionHeader: View {
    @Environment(\.theme) private var theme
    private let title: String

    init(_ title: String) { self.title = title }

    var body: some View {
        Text(title)
            .font(Typography.captionStrong)
            .foregroundStyle(theme.mutedFg)
            .textCase(.uppercase)
    }
}

/// A title with an optional secondary line — the left side of most rows.
struct SettingsLabeledRow: View {
    @Environment(\.theme) private var theme
    let title: String
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.space2) {
            Text(title)
                .font(Typography.bodyMedium)
                .foregroundStyle(theme.foreground)
            if let subtitle {
                Text(subtitle)
                    .font(Typography.caption)
                    .foregroundStyle(theme.mutedFg)
            }
        }
    }
}

/// The Workspace-name row. READ-ONLY (PARITY-SETTINGS §1): iOS's SDK path has no
/// workspace rename and hosted mode fixes the name server-side, so the value is
/// non-editable — the real name once the model has it, else a "managed" hint.
struct WorkspaceNameRow: View {
    @Environment(\.theme) private var theme
    let name: String?

    var body: some View {
        HStack(spacing: Spacing.space12) {
            SettingsLabeledRow(title: Strings.Settings.workspaceTitle)
            Spacer(minLength: Spacing.space8)
            Text(name ?? Strings.Settings.workspaceNameReadOnly)
                .font(Typography.callout)
                .foregroundStyle(theme.mutedFg)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .accessibilityElement(children: .combine)
    }
}

/// A context row (Workspace context / Your context). DISABLED (PARITY-SETTINGS
/// §1, §4): no context-doc command is reachable from the phone yet, so the row
/// shows an honest "Not available yet" and is non-interactive rather than a
/// drill-in that can't save.
struct ContextRow: View {
    @Environment(\.theme) private var theme
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: Spacing.space12) {
            SettingsLabeledRow(title: title, subtitle: subtitle)
            Spacer(minLength: Spacing.space8)
            Text(Strings.Settings.notAvailableYet)
                .font(Typography.caption)
                .foregroundStyle(theme.mutedFg)
        }
        .opacity(0.55)
        .accessibilityElement(children: .combine)
        .accessibilityHint(Strings.Settings.notAvailableYet)
    }
}

// MARK: - Toast

extension View {
    /// A brief bottom toast (the iOS analogue of the desktop `addToast`) used for
    /// "Language changed" / "Version copied". Auto-dismiss is driven by the
    /// caller nil-ing the text.
    func settingsToast(_ text: String?) -> some View {
        modifier(SettingsToastModifier(text: text))
    }
}

private struct SettingsToastModifier: ViewModifier {
    @Environment(\.theme) private var theme
    let text: String?

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let text {
                    Text(text)
                        .font(Typography.label)
                        .foregroundStyle(theme.popoverFg)
                        .padding(.horizontal, Spacing.space16)
                        .padding(.vertical, Spacing.space10)
                        .background(theme.popover, in: Capsule())
                        .overlay(Capsule().strokeBorder(theme.border))
                        .padding(.bottom, Spacing.space24)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.default, value: text)
    }
}

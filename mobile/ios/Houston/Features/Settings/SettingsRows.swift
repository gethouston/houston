import SwiftUI

/// Shared chrome for the Settings list. Every colour/spacing/type value comes
/// from the design system (Theme / Spacing / Typography) — no raw literals in a
/// feature (client-architecture.md invariant 2).

/// A themed grouped-list section header, matching the desktop's muted uppercase
/// group labels.
struct SettingsSectionHeader: View {
    @Environment(\.theme) private var theme
    private let title: String

    init(_ title: String) { self.title = title }

    var body: some View {
        Text(title)
            .font(Typography.captionStrong)
            .foregroundStyle(theme.inkMuted)
            .textCase(.uppercase)
    }
}

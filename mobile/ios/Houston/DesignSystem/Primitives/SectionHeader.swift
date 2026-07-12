import SwiftUI

/// A muted section header (e.g. a board column heading, a grouped-list header)
/// with an optional trailing accessory (a count, an add button).
struct SectionHeader<Accessory: View>: View {
    @Environment(\.theme) private var theme
    let title: String
    @ViewBuilder var accessory: () -> Accessory

    var body: some View {
        HStack(spacing: Spacing.space8) {
            Text(title)
                .font(Typography.captionStrong)
                .foregroundStyle(theme.inkMuted)
                .textCase(.uppercase)
            Spacer(minLength: Spacing.space8)
            accessory()
        }
        .padding(.horizontal, Spacing.space12)
        .padding(.vertical, Spacing.space8)
    }
}

extension SectionHeader where Accessory == EmptyView {
    init(_ title: String) {
        self.init(title: title) { EmptyView() }
    }
}

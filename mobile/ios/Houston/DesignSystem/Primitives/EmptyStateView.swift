import SwiftUI

/// A centered empty/placeholder state: optional icon, title, description, and an
/// optional CTA. Drives every empty state in PARITY §3 (no conversations, no
/// matching missions, searching, no agents, archived-empty). Copy comes from
/// `Strings`; callers never inline empty-state text.
struct EmptyStateView: View {
    @Environment(\.theme) private var theme
    let title: String
    var description: String?
    var systemImage: String?
    var ctaTitle: String?
    var ctaAction: (() -> Void)?

    var body: some View {
        VStack(spacing: Spacing.space12) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(Typography.font(HoustonFontSize.h1))
                    .foregroundStyle(theme.inkMuted)
            }
            Text(title)
                .font(Typography.title)
                .foregroundStyle(theme.ink)
                .multilineTextAlignment(.center)
            if let description {
                Text(description)
                    .font(Typography.callout)
                    .foregroundStyle(theme.inkMuted)
                    .multilineTextAlignment(.center)
            }
            if let ctaTitle, let ctaAction {
                Button(action: ctaAction) {
                    Text(ctaTitle)
                        .font(Typography.label)
                        .foregroundStyle(theme.actionText)
                        .padding(.horizontal, Spacing.space16)
                        .padding(.vertical, Spacing.space8)
                        .background(theme.action, in: Capsule())
                }
                .padding(.top, Spacing.space4)
            }
        }
        .padding(Spacing.space24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

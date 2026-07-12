import SwiftUI

/// A typed provider-error card (PARITY §5): a clean destructive-tinted card with
/// the kind's title and detail, plus the raw output for the unclassified case.
/// The caller only renders this when ``ProviderError/presentation`` is non-nil —
/// `cancelled` and future kinds produce no card.
struct ProviderErrorCardView: View {
  @Environment(\.theme) private var theme
  let presentation: ProviderErrorPresentation

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space6) {
      HStack(spacing: Spacing.space6) {
        Image(systemName: "exclamationmark.triangle.fill")
          .font(Typography.caption)
          .foregroundStyle(theme.danger)
        Text(presentation.title)
          .font(Typography.label)
          .foregroundStyle(theme.ink)
      }
      Text(presentation.detail)
        .font(Typography.callout)
        .foregroundStyle(theme.inkMuted)
        .fixedSize(horizontal: false, vertical: true)
      if let raw = presentation.rawExcerpt {
        VStack(alignment: .leading, spacing: Spacing.space2) {
          Text(Strings.Chat.ProviderErrorCopy.rawLabel)
            .font(Typography.captionStrong)
            .foregroundStyle(theme.inkMuted)
          Text(raw)
            .font(Typography.caption)
            .foregroundStyle(theme.inkMuted)
            .textSelection(.enabled)
            .lineLimit(8)
        }
        .padding(.top, Spacing.space2)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Spacing.space12)
    .background(theme.danger.opacity(0.08), in: RoundedRectangle(cornerRadius: Radius.lg))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.lg)
        .strokeBorder(theme.danger.opacity(0.5), lineWidth: 1))
  }
}

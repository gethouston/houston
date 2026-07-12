import SwiftUI

/// One provider tile on the AI Models grid. Calm secondary surface + hairline
/// ring (connected and available look identical, differing only in the footer —
/// live status vs a Connect pill), matching the desktop `ProviderCard`. The whole
/// tile is one button: a connected provider opens its detail, an available one
/// starts the connect flow. A login in flight reads "Connecting..." and is inert.
struct ProviderCardView: View {
  @Environment(\.theme) private var theme
  let card: ProviderCardModel
  let onTap: () -> Void

  var body: some View {
    Button(action: onTap) {
      VStack(alignment: .leading, spacing: Spacing.space8) {
        HStack(spacing: Spacing.space8) {
          ProviderGlyph(providerId: card.glyphId, size: 22)
          Text(card.name)
            .font(Typography.bodyMedium)
            .foregroundStyle(theme.ink)
            .lineLimit(1)
        }
        if let description = Strings.AIModels.providerDescription(card.descriptionKey) {
          Text(description)
            .font(Typography.caption)
            .foregroundStyle(theme.inkMuted)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        Spacer(minLength: Spacing.space4)
        footer
      }
      .padding(Spacing.space16)
      .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
      .background(theme.chip, in: RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: Radius.xl, style: .continuous)
          .strokeBorder(theme.line, lineWidth: 1))
      .contentShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(card.connecting)
  }

  @ViewBuilder private var footer: some View {
    if card.connecting {
      statusLabel(Strings.AIModels.Card.connecting, dot: nil) {
        ProgressView().controlSize(.mini)
      }
    } else if card.configured {
      statusLabel(Strings.AIModels.Card.connected, dot: theme.success) { EmptyView() }
    } else {
      Text(Strings.AIModels.Card.connect)
        .font(Typography.label)
        .foregroundStyle(theme.actionText)
        .padding(.horizontal, Spacing.space12)
        .padding(.vertical, Spacing.space6)
        .background(theme.action, in: Capsule())
    }
  }

  private func statusLabel(
    _ text: String, dot: Color?, @ViewBuilder leading: () -> some View
  ) -> some View {
    HStack(spacing: Spacing.space6) {
      leading()
      if let dot { Circle().fill(dot).frame(width: 6, height: 6) }
      Text(text)
        .font(Typography.label)
        .foregroundStyle(theme.inkMuted)
    }
  }
}

/// A disabled "coming soon" tile (`COMING_SOON_PROVIDERS`) — an initial mark and
/// the muted state, never connectable.
struct ComingSoonCardView: View {
  @Environment(\.theme) private var theme
  let provider: ComingSoonProvider

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space8) {
      HStack(spacing: Spacing.space8) {
        Text(provider.mark)
          .font(Typography.captionStrong)
          .foregroundStyle(theme.inkMuted)
          .frame(width: 22, height: 22)
          .background(theme.chipSubtle, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        Text(provider.name)
          .font(Typography.bodyMedium)
          .foregroundStyle(theme.ink)
          .lineLimit(1)
      }
      Text(provider.subtitle)
        .font(Typography.caption)
        .foregroundStyle(theme.inkMuted)
        .lineLimit(2)
      Spacer(minLength: Spacing.space4)
      Text(Strings.AIModels.Card.comingSoon)
        .font(Typography.label)
        .foregroundStyle(theme.inkMuted)
    }
    .padding(Spacing.space16)
    .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
    .background(theme.chip, in: RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.xl, style: .continuous)
        .strokeBorder(theme.line, lineWidth: 1))
    .opacity(0.7)
  }
}

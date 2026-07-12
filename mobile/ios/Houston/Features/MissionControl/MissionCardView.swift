import SwiftUI

/// One mission card (PARITY §3 anatomy): agent-name group line, title
/// (line-clamp-2), description preview (line-clamp-2), tags, updatedAt, and the
/// agent avatar. Card chrome carries the state semantics — the running-glow
/// animated border for `running`, a destructive border for `error` — while
/// `needs_you` differs by exposing the Approve action (owned by the list, via
/// context menu / swipe), not by border color (PARITY §1).
struct MissionCardView: View {
  @Environment(\.theme) private var theme
  let card: MissionCardData

  private var isRunning: Bool { card.state == .running }
  private var isError: Bool { card.state == .error }
  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
  }

  var body: some View {
    HStack(alignment: .top, spacing: Spacing.space12) {
      HoustonAvatar(agentColorHex: card.agentColorHex, diameter: 36, running: isRunning)
      VStack(alignment: .leading, spacing: Spacing.space4) {
        Text(card.agentName)
          .font(Typography.caption)
          .foregroundStyle(theme.inkMuted)
          .lineLimit(1)
        Text(card.title)
          .font(Typography.title)
          .foregroundStyle(theme.ink)
          .lineLimit(2)
        if !card.descriptionPreview.isEmpty {
          Text(card.descriptionPreview)
            .font(Typography.callout)
            .foregroundStyle(theme.inkMuted)
            .lineLimit(2)
        }
        footer
      }
    }
    .padding(Spacing.space16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(theme.card, in: shape)
    .overlay { border }
    .runningGlow(shape, active: isRunning)
    .contentShape(shape)
  }

  private var footer: some View {
    HStack(spacing: Spacing.space8) {
      ForEach(card.tags, id: \.self) { tag in
        Text(tag)
          .font(Typography.label)
          .foregroundStyle(theme.chipText)
          .padding(.horizontal, Spacing.space8)
          .padding(.vertical, Spacing.space2)
          .background(theme.chip, in: Capsule())
      }
      Spacer(minLength: Spacing.space8)
      if let updated = MissionTimestamp.relativeLabel(card.updatedAt) {
        Text(updated)
          .font(Typography.caption)
          .foregroundStyle(theme.inkMuted)
      }
    }
    .padding(.top, Spacing.space4)
  }

  @ViewBuilder private var border: some View {
    if isError {
      shape.strokeBorder(theme.danger.opacity(0.6), lineWidth: 1)
    } else if !isRunning {
      shape.strokeBorder(theme.line, lineWidth: 1)
    }
  }
}

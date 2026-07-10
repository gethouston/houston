import SwiftUI

/// The mission chat's title bar (WhatsApp-style), rendered in the nav bar's
/// `.principal` slot: the agent's helmet avatar beside a two-line stack — the
/// agent display name over a live status line. Non-interactive in this wave (no
/// tap action). Purely presentational: the status is derived by the pure
/// ``ChatTitleStatus`` and passed in; this view only draws it.
struct ChatTitleView: View {
  @Environment(\.theme) private var theme
  /// The agent display name (line 1).
  let name: String
  /// Whether a turn is in flight — grows the avatar's running-glow halo.
  let running: Bool
  /// The derived second line (working / needs-attention / none).
  let status: ChatTitleStatus

  private static let avatarDiameter: CGFloat = 26

  var body: some View {
    HStack(spacing: Spacing.space8) {
      HoustonAvatar(agentColorHex: nil, diameter: Self.avatarDiameter, running: running)
      VStack(alignment: .leading, spacing: Spacing.space2) {
        Text(name)
          .font(Typography.bodyMedium)
          .foregroundStyle(theme.foreground)
          .lineLimit(1)
        statusLine
      }
    }
    .accessibilityElement(children: .combine)
  }

  /// The second line: shimmered "working…" while running, a warning-tinted
  /// "needs your attention" when settled and awaiting the user, else nothing so
  /// the name centres beside the avatar.
  @ViewBuilder private var statusLine: some View {
    switch status {
    case .working:
      Text(Strings.Chat.TitleBar.working)
        .font(Typography.caption)
        .foregroundStyle(theme.mutedFg)
        .lineLimit(1)
        .shimmer(active: true)
    case .needsAttention:
      Text(Strings.Chat.TitleBar.needsAttention)
        .font(Typography.caption)
        .foregroundStyle(theme.warning)
        .lineLimit(1)
    case .hidden:
      EmptyView()
    }
  }
}

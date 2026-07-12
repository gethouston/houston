import SwiftUI

extension View {
  /// The soft drop shadow shared by the chat's floating chrome — the
  /// scroll-to-latest button (``MissionFeed``) and the floating date pill — so
  /// their elevation stays in sync from one definition.
  func floatingChromeShadow() -> some View {
    shadow(color: .black.opacity(0.12), radius: 6, y: 2)
  }
}

/// The soft capsule shared by the inline day separator and the floating overlay:
/// a muted caption on a translucent `secondary` fill (WhatsApp/Telegram day pill).
struct DayPill: View {
  @Environment(\.theme) private var theme
  let text: String

  var body: some View {
    Text(text)
      .font(Typography.caption)
      .foregroundStyle(theme.inkMuted)
      .padding(.horizontal, Spacing.space10)
      .padding(.vertical, Spacing.space4)
      .background(theme.chip.opacity(0.8), in: Capsule())
  }
}

/// A centered inline day separator between two calendar days in the transcript.
struct DaySeparatorView: View {
  let day: Date

  var body: some View {
    DayPill(text: TimelineDayLabel.label(for: day))
      .frame(maxWidth: .infinity)
      .padding(.vertical, Spacing.space12)
  }
}

/// The floating date pill: the current top day, pinned top-center while the user
/// scrolls history. Non-interactive; it only reports where they are.
struct FloatingDatePill: View {
  let day: Date

  var body: some View {
    DayPill(text: TimelineDayLabel.label(for: day))
      .padding(.top, Spacing.space12)
      .floatingChromeShadow()
      .allowsHitTesting(false)
  }
}

/// The unread-count badge on the scroll-to-latest button (mini `primary` capsule,
/// top-trailing), counting messages that arrived while scrolled up.
struct UnreadBadge: View {
  @Environment(\.theme) private var theme
  let count: Int

  var body: some View {
    Text(Strings.cappedCount(count))
      .font(Typography.captionStrong)
      .foregroundStyle(theme.actionText)
      .padding(.horizontal, Spacing.space6)
      .padding(.vertical, Spacing.space2)
      .background(theme.action, in: Capsule())
  }
}

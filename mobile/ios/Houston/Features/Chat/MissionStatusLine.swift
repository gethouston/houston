import SwiftUI

/// The live status line shown above the composer while a turn runs (PARITY §5):
/// a shimmering "Mission in progress..." (with ": {{action}}" when the VM exposes
/// a current action) and a Stop control. Stop cancels the turn — there is NO
/// "stopped" copy; a Stop moves the card to Needs you silently.
struct MissionStatusLine: View {
  @Environment(\.theme) private var theme
  /// The current action the VM exposes, if any; nil renders the base copy.
  var action: String?
  let onStop: () -> Void

  var body: some View {
    HStack(spacing: Spacing.space10) {
      Circle()
        .fill(GlowColor.running)
        .frame(width: 6, height: 6)  // status-dot diameter, matching StatusChip
      Text(label)
        .font(Typography.label)
        .foregroundStyle(theme.mutedFg)
        .lineLimit(1)
        .shimmer(active: true)
      Spacer(minLength: Spacing.space8)
      Button(action: onStop) {
        Text(Strings.Chat.stop)
          .font(Typography.label)
          .foregroundStyle(theme.foreground)
          .padding(.horizontal, Spacing.space12)
          .padding(.vertical, Spacing.space6)
          .background(theme.secondary, in: Capsule())
          .overlay(Capsule().strokeBorder(theme.border, lineWidth: 1))
      }
      .accessibilityLabel(Strings.Chat.stop)
    }
    .padding(.horizontal, Spacing.space16)
    .padding(.vertical, Spacing.space8)
  }

  private var label: String {
    if let action, !action.isEmpty {
      return Strings.Chat.missionInProgress(action: action)
    }
    return Strings.Chat.missionInProgress
  }
}

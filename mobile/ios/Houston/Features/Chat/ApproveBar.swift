import SwiftUI

/// The Approve bar shown above the composer when the mission is `needs_you` and
/// not running (PARITY §5): a single "Move to done" action that transitions the
/// activity to `done`.
struct ApproveBar: View {
  @Environment(\.theme) private var theme
  let onApprove: () -> Void

  var body: some View {
    Button(action: onApprove) {
      HStack(spacing: Spacing.space8) {
        Image(systemName: "checkmark.circle.fill")
        Text(Strings.Chat.moveToDone)
          .font(Typography.label)
        Spacer(minLength: 0)
      }
      .foregroundStyle(theme.successFg)
      .padding(.horizontal, Spacing.space16)
      .padding(.vertical, Spacing.space10)
      .background(theme.success, in: RoundedRectangle(cornerRadius: Radius.xl))
    }
    .padding(.horizontal, Spacing.space16)
    .padding(.top, Spacing.space8)
    .accessibilityLabel(Strings.Chat.moveToDone)
  }
}

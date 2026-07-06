import SwiftUI

/// A colored dot + localized label describing one connection's live status
/// (PARITY-SETTINGS §3 `status.*`): active → "Connected" (success), pending →
/// "Finishing up" (warning), error → "Needs reconnecting" (destructive). An
/// unrecognized status shows its raw label with a muted dot.
struct ConnectionStatusBadge: View {
  @Environment(\.theme) private var theme
  let status: ConnectionStatus

  var body: some View {
    HStack(spacing: Spacing.space6) {
      Circle()
        .fill(dotColor)
        .frame(width: 6, height: 6)
      Text(Strings.Integrations.status(status))
        .font(Typography.caption)
        .foregroundStyle(theme.mutedFg)
    }
  }

  private var dotColor: Color {
    switch status {
    case .active: return theme.success
    case .pending: return theme.warning
    case .error: return theme.destructive
    case .unknown: return theme.mutedFg
    }
  }
}

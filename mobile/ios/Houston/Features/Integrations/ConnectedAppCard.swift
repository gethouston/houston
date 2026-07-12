import SwiftUI

/// One connected app in the global page's grid (PARITY-SETTINGS §3): the remote
/// logo, the real app name, its live connection status, and a "used by" line
/// summarizing which agents may use it. Tapping opens the per-app detail sheet.
///
/// The used-by line reflects the grant tri-state: unsupported → "All agents",
/// zero granting agents → "No agents yet", otherwise "Used by N agents".
struct ConnectedAppCard: View {
  @Environment(\.theme) private var theme
  let connection: IntegrationConnection
  let display: AppDisplay
  let grants: IntegrationGrants
  let onTap: () -> Void

  var body: some View {
    Button(action: onTap) {
      VStack(alignment: .leading, spacing: Spacing.space10) {
        HStack(spacing: Spacing.space10) {
          AppLogoView(display: display, diameter: 40)
          Text(display.name)
            .font(Typography.bodyMedium)
            .foregroundStyle(theme.ink)
            .lineLimit(1)
          Spacer(minLength: 0)
        }
        ConnectionStatusBadge(status: connection.status)
        Text(usedByLine)
          .font(Typography.caption)
          .foregroundStyle(theme.inkMuted)
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(Spacing.space12)
      .background(theme.card, in: RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: Radius.xl, style: .continuous)
          .strokeBorder(theme.line, lineWidth: 1))
    }
    .buttonStyle(.plain)
  }

  private var usedByLine: String {
    guard grants.supported else { return Strings.Integrations.usedByAll }
    let count = grants.agentIds(forToolkit: connection.toolkit).count
    return count == 0 ? Strings.Integrations.usedByNone : Strings.Integrations.usedBy(count: count)
  }
}

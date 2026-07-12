import SwiftUI

/// One app in a list: logo, name, an optional secondary line (description or
/// status), and a trailing accessory. Used by the connect catalog, the per-agent
/// sections, and any connected list so every app row reads identically. Tapping
/// runs `onTap` when set; otherwise the row is inert (e.g. an already-connected
/// catalog entry).
struct AppRowView<Trailing: View>: View {
  @Environment(\.theme) private var theme
  let display: AppDisplay
  var subtitle: String? = nil
  var onTap: (() -> Void)? = nil
  @ViewBuilder var trailing: () -> Trailing

  var body: some View {
    if let onTap {
      Button(action: onTap) { content }.buttonStyle(.plain)
    } else {
      content
    }
  }

  private var content: some View {
    ListRow {
      HStack(spacing: Spacing.space12) {
        AppLogoView(display: display, diameter: 40)
        VStack(alignment: .leading, spacing: Spacing.space2) {
          Text(display.name)
            .font(Typography.bodyMedium)
            .foregroundStyle(theme.ink)
            .lineLimit(1)
          if let subtitle, !subtitle.isEmpty {
            Text(subtitle)
              .font(Typography.caption)
              .foregroundStyle(theme.inkMuted)
              .lineLimit(1)
          }
        }
        Spacer(minLength: Spacing.space8)
        trailing()
      }
    }
  }
}

extension AppRowView where Trailing == EmptyView {
  init(display: AppDisplay, subtitle: String? = nil, onTap: (() -> Void)? = nil) {
    self.init(display: display, subtitle: subtitle, onTap: onTap) { EmptyView() }
  }
}

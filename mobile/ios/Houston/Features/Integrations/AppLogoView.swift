import SwiftUI

/// A connected/connectable app's logo. Toolkit logos are REMOTE URLs, so this
/// loads them with `AsyncImage` and falls back to an initial-letter tile while
/// loading, when there is no URL, or on failure (PARITY-SETTINGS §7 — the one
/// remote-image path, distinct from the inline-SVG provider glyphs). Never draws
/// a broken-image placeholder.
struct AppLogoView: View {
  @Environment(\.theme) private var theme
  let display: AppDisplay
  var diameter: CGFloat = 40

  var body: some View {
    Group {
      if let url = display.logoURL {
        AsyncImage(url: url) { phase in
          switch phase {
          case let .success(image):
            image.resizable().scaledToFit().padding(diameter * 0.15)
          default:
            fallback
          }
        }
      } else {
        fallback
      }
    }
    .frame(width: diameter, height: diameter)
    .background(theme.muted, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
        .strokeBorder(theme.border, lineWidth: 1)
    )
    .accessibilityHidden(true)
  }

  private var fallback: some View {
    Text(display.initial)
      .font(Typography.font(diameter * 0.4, HoustonFontWeight.semibold))
      .foregroundStyle(theme.mutedFg)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

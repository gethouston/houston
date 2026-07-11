import SwiftUI

/// The signature chat wallpaper: `theme.background` overlaid with a sparse,
/// static diagonal lattice of the Houston helmet glyph at very low contrast —
/// the Houston-branded answer to WhatsApp's doodle background, whose flat
/// backdrop is the #1 "this isn't a messenger" tell.
///
/// Draws once with `Canvas` (no animation, no timeline): the closure re-runs
/// only when the size or theme changes, so there is no per-frame cost. Geometry
/// comes entirely from ``ChatWallpaperLayout``; the mark is the shared
/// `HelmetShape`, never a hand-drawn path. Under Reduce Transparency the pattern
/// is dropped for a flat background (``ChatWallpaperVisibility``).
///
/// Purely decorative and hidden from assistive tech; place it behind the feed
/// (e.g. as a `.background { }`), where it bleeds under the composer material.
struct ChatWallpaperView: View {
  @Environment(\.theme) private var theme
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  var body: some View {
    ZStack {
      theme.background
      if ChatWallpaperVisibility.showsPattern(reduceTransparency: reduceTransparency) {
        pattern
      }
    }
    .ignoresSafeArea()
    .accessibilityHidden(true)
  }

  private var pattern: some View {
    Canvas { context, size in
      // Build the fitted helmet once (parses the shared SVG a single time), then
      // stamp a translated copy at each center — cheap even for dozens of marks.
      let side = ChatWallpaperLayout.glyphSize
      let base = HelmetShape().path(in: CGRect(x: 0, y: 0, width: side, height: side))
      let shading = GraphicsContext.Shading.color(
        theme.foreground.opacity(ChatWallpaperLayout.patternOpacity))

      for center in ChatWallpaperLayout.glyphCenters(in: size) {
        let stamped = base.applying(
          CGAffineTransform(translationX: center.x - side / 2, y: center.y - side / 2))
        context.fill(stamped, with: shading)
      }
    }
  }
}

import CoreGraphics

/// The pure geometry + gating behind ``ChatWallpaperView`` — the signature chat
/// wallpaper (the WhatsApp-doodle equivalent, Houston-branded). All layout math
/// lives here, view-free and deterministic, so it unit-tests directly: given a
/// size it returns the helmet-glyph centers; given the reduce-transparency flag
/// it decides whether the pattern draws at all.
///
/// The tile is a sparse, static diagonal lattice: upright Houston helmets on a
/// regular grid, with every odd row shifted half a column so the marks read as
/// diagonals (WhatsApp doodle spacing) rather than a plain grid. Seedless — the
/// pattern is anchored at the top-left origin, so the same size always yields
/// the same centers (no randomness, no timeline, no per-frame work).
enum ChatWallpaperLayout {
  /// The drawn helmet size (points). Aspect-fits into a square of this side; the
  /// helmet viewBox is taller than wide, so the mark is ~this tall and narrower.
  /// A feature constant (no matching `Spacing`/`Radius` token), centralized and
  /// documented per the `ChatMetrics` / `RunningGlow.GlowColor` precedent for
  /// brand values outside the semantic token scale.
  static let glyphSize: CGFloat = 28

  /// Horizontal distance between glyph centers within a row. Generous (~2.6×
  /// the glyph) so the field stays sparse and quiet, never busy. Feature
  /// constant (see `glyphSize`).
  static let columnSpacing: CGFloat = 72

  /// Vertical distance between rows. Slightly tighter than the column step so
  /// the half-row offset produces a clear diagonal cadence. Feature constant.
  static let rowSpacing: CGFloat = 60

  /// The pattern's fill opacity, applied to `theme.ink`. Very low so the
  /// wallpaper is a texture, not decoration — it must never compete with bubbles
  /// or the day/date pills layered over it. Feature constant.
  static let patternOpacity: CGFloat = 0.035

  /// Glyph centers tiling `size`, row-major. Even rows start at x = 0; odd rows
  /// are shifted `columnSpacing / 2` to the right (the diagonal offset). One
  /// extra row and column beyond each edge guarantee the marks bleed off-screen
  /// so the texture reads as continuous rather than clipped at the margins.
  ///
  /// Deterministic and side-effect-free: identical `size` → identical result.
  static func glyphCenters(in size: CGSize) -> [CGPoint] {
    guard size.width > 0, size.height > 0 else { return [] }

    let rows = rowCount(forHeight: size.height)
    let cols = columnCount(forWidth: size.width)
    var centers: [CGPoint] = []
    centers.reserveCapacity(rows * cols)

    for r in 0..<rows {
      let y = CGFloat(r) * rowSpacing
      let xOffset = r.isMultiple(of: 2) ? 0 : columnSpacing / 2
      for c in 0..<cols {
        centers.append(CGPoint(x: CGFloat(c) * columnSpacing + xOffset, y: y))
      }
    }
    return centers
  }

  /// Rows needed to cover `height` (plus one so the bottom edge is bled over).
  static func rowCount(forHeight height: CGFloat) -> Int {
    Int((height / rowSpacing).rounded(.up)) + 1
  }

  /// Columns needed to cover `width` (plus one for the right-edge bleed; also
  /// absorbs the odd-row half-column shift so those rows still reach the edge).
  static func columnCount(forWidth width: CGFloat) -> Int {
    Int((width / columnSpacing).rounded(.up)) + 1
  }
}

/// Whether the branded pattern draws, or the surface falls back to a flat
/// `theme.input`. Split out as a pure predicate so the accessibility gate
/// is unit-tested without touching SwiftUI's environment.
enum ChatWallpaperVisibility {
  /// The pattern is suppressed under Reduce Transparency: users who ask for a
  /// plainer, higher-contrast UI get the flat background, not the texture.
  static func showsPattern(reduceTransparency: Bool) -> Bool {
    !reduceTransparency
  }
}

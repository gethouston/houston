import CoreGraphics
import SwiftUI

/// A `Shape` that renders one or more verbatim SVG `d` path strings (plus the
/// occasional rounded rect / ellipse the source SVGs use instead of a path)
/// inside a viewBox, aspect-fit into the draw rect via the shared `SVGPath`
/// decoder. It carries no colour — fill it or stroke it from the caller, so the
/// same geometry serves the filled and stroked provider marks alike.
struct ProviderLogoShape: Shape {
    struct RoundedRect: Equatable {
        let rect: CGRect
        let radius: CGFloat
    }

    var viewBox = CGSize(width: 24, height: 24)
    var paths: [String] = []
    var roundedRects: [RoundedRect] = []
    var ellipses: [CGRect] = []

    func path(in rect: CGRect) -> Path {
        var raw = Path()
        for d in paths { raw.addPath(SVGPath.rawPath(from: d)) }
        for rr in roundedRects {
            raw.addRoundedRect(in: rr.rect, cornerSize: CGSize(width: rr.radius, height: rr.radius))
        }
        for e in ellipses { raw.addEllipse(in: e) }
        return raw.applying(SVGPath.fitTransform(viewBox: viewBox, in: rect))
    }
}

/// A filled provider mark: the geometry filled with the theme foreground
/// (`currentColor` on desktop). `eoFill` renders even-odd so nested rectangles
/// punch holes (OpenCode's frame ring).
struct FilledProviderLogo: View {
    @Environment(\.theme) private var theme

    var viewBox = CGSize(width: 24, height: 24)
    var paths: [String]
    var eoFill = false
    var size: CGFloat = 20
    var color: Color?

    var body: some View {
        ProviderLogoShape(viewBox: viewBox, paths: paths)
            .fill(color ?? theme.ink, style: FillStyle(eoFill: eoFill))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// A stroked provider mark: the geometry stroked in the theme foreground with
/// round caps/joins (matching the source SVGs), optionally accompanied by filled
/// dots (OpenRouter's endpoints). The SVG stroke width is expressed in viewBox
/// units, so it is scaled by the aspect-fit factor to render at the right weight
/// regardless of the frame the caller assigns.
struct StrokedProviderLogo: View {
    @Environment(\.theme) private var theme

    var viewBox = CGSize(width: 24, height: 24)
    var paths: [String] = []
    var roundedRects: [ProviderLogoShape.RoundedRect] = []
    var filledEllipses: [CGRect] = []
    var strokeWidth: CGFloat
    var size: CGFloat = 20

    var body: some View {
        GeometryReader { geo in
            let scale = min(geo.size.width / viewBox.width, geo.size.height / viewBox.height)
            ZStack {
                ProviderLogoShape(viewBox: viewBox, paths: paths, roundedRects: roundedRects)
                    .stroke(
                        theme.ink,
                        style: StrokeStyle(lineWidth: strokeWidth * scale, lineCap: .round, lineJoin: .round)
                    )
                if !filledEllipses.isEmpty {
                    ProviderLogoShape(viewBox: viewBox, ellipses: filledEllipses)
                        .fill(theme.ink)
                }
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

import SwiftUI

/// The comet-trail glow colours from `.card-running-glow` (ui/core globals.css).
/// These are brand glow accents, not part of the semantic token palette, so they
/// live here as documented constants rather than as raw literals in features.
enum GlowColor {
    /// The primary running blue (#3b82f6) — also the running status dot.
    static let running = Color(.sRGB, red: 59 / 255, green: 130 / 255, blue: 246 / 255)
    /// The soft outer shadow: rgba(59,130,246,0.12).
    static let shadow = Color(.sRGB, red: 59 / 255, green: 130 / 255, blue: 246 / 255, opacity: 0.12)

    /// Conic sweep stops, mirroring the globals.css keyframe gradient.
    static let sweep = Gradient(stops: [
        .init(color: .clear, location: 0.00),
        .init(color: running.opacity(0.15), location: 0.68),
        .init(color: running, location: 0.74),
        .init(color: Color(.sRGB, red: 129 / 255, green: 140 / 255, blue: 248 / 255), location: 0.78),
        .init(color: Color(.sRGB, red: 249 / 255, green: 115 / 255, blue: 22 / 255), location: 0.82),
        .init(color: Color(.sRGB, red: 251 / 255, green: 191 / 255, blue: 36 / 255), location: 0.84),
        .init(color: .clear, location: 0.88),
    ])
}

/// Animated running border + soft blue shadow approximating `.card-running-glow`.
/// A `TimelineView(.animation)` rotates a conic sweep around the shape's edge
/// (2.5s linear, matching the web `glow-spin`) — cheap enough for 60fps and only
/// alive while `active`.
struct RunningGlow<S: InsettableShape>: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let shape: S
    let active: Bool
    var lineWidth: CGFloat = 1.5

    func body(content: Content) -> some View {
        content
            .overlay { if active { border } }
            .shadow(color: active ? GlowColor.shadow : .clear, radius: active ? 8 : 0)
    }

    @ViewBuilder private var border: some View {
        if reduceMotion {
            shape.strokeBorder(GlowColor.running.opacity(0.6), lineWidth: lineWidth)
        } else {
            TimelineView(.animation) { context in
                let period = 2.5
                let t = context.date.timeIntervalSinceReferenceDate
                    .truncatingRemainder(dividingBy: period) / period
                shape
                    .strokeBorder(
                        AngularGradient(
                            gradient: GlowColor.sweep,
                            center: .center,
                            angle: .degrees(t * 360)
                        ),
                        lineWidth: lineWidth
                    )
            }
        }
    }
}

extension View {
    /// Wrap a view in the running-glow halo when `active`. Pass the shape whose
    /// edge the comet traces (`Circle()` for avatars, a rounded rect for cards).
    func runningGlow<S: InsettableShape>(_ shape: S, active: Bool, lineWidth: CGFloat = 1.5) -> some View {
        modifier(RunningGlow(shape: shape, active: active, lineWidth: lineWidth))
    }

    /// Circular running-glow convenience (agent avatars).
    func runningGlow(active: Bool) -> some View {
        modifier(RunningGlow(shape: Circle(), active: active))
    }
}

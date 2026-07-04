import SwiftUI

/// A subtle left-to-right highlight sweep for live labels ("Thinking...",
/// "Mission in progress..."). Driven by `TimelineView(.animation)` so it costs
/// nothing when inactive and never churns view state; honours Reduce Motion by
/// rendering the plain content.
private struct Shimmer: ViewModifier {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let active: Bool

  func body(content: Content) -> some View {
    if active && !reduceMotion {
      content.overlay { sweep.mask(content) }.allowsHitTesting(false)
    } else {
      content
    }
  }

  private var sweep: some View {
    GeometryReader { geo in
      TimelineView(.animation) { context in
        let period = 1.4
        let phase = context.date.timeIntervalSinceReferenceDate
          .truncatingRemainder(dividingBy: period) / period
        LinearGradient(
          colors: [.clear, Color.white.opacity(0.6), .clear],
          startPoint: .leading, endPoint: .trailing
        )
        .frame(width: geo.size.width * 0.55)
        .offset(x: (phase * 2 - 0.6) * geo.size.width)
        .blendMode(.plusLighter)
      }
    }
  }
}

extension View {
  /// Overlay a shimmer sweep while `active` (Reduce-Motion safe).
  func shimmer(active: Bool) -> some View { modifier(Shimmer(active: active)) }
}
